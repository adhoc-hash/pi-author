export async function extractDataFromPng(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  let i = 8;
  const chunks: { keyword: string; text: string }[] = [];

  while (i < bytes.length) {
    const view = new DataView(bytes.buffer, i);
    const length = view.getUint32(0);
    const type = new TextDecoder().decode(bytes.slice(i + 4, i + 8));

    if (type === 'tEXt' || type === 'iTXt') {
      const data_start = i + 8;
      let currentKeyword = '';
      let k_end = data_start;
      while (k_end < data_start + length && bytes[k_end] !== 0) {
        currentKeyword += String.fromCharCode(bytes[k_end]);
        k_end++;
      }

      if (currentKeyword === 'ccv3' || currentKeyword === 'chara') {
        const dataBytes = bytes.slice(k_end + 1, data_start + length);
        const base64String = new TextDecoder('utf-8').decode(dataBytes);
        try {
          const binaryString = atob(base64String);
          const decodedBytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            decodedBytes[j] = binaryString.charCodeAt(j);
          }
          const jsonString = new TextDecoder('utf-8').decode(decodedBytes);
          chunks.push({ keyword: currentKeyword, text: jsonString });
        } catch (e) {
          console.error(`Failed to decode base64 for ${currentKeyword}:`, e);
        }
      }
    }
    i += 12 + length;
  }

  // 优先使用 ccv3, 如果没有则退化为 chara
  const ccv3Chunk = chunks.find((c) => c.keyword === 'ccv3');
  if (ccv3Chunk) return JSON.parse(ccv3Chunk.text);

  const charaChunk = chunks.find((c) => c.keyword === 'chara');
  if (charaChunk) return JSON.parse(charaChunk.text);

  throw new Error('未能在PNG中找到角色数据(ccv3或chara)。');
}

/**
 * 将角色卡数据嵌入到 PNG 文件中
 * @param originalPng 原始 PNG ArrayBuffer（可选，用于保留原图）
 * @param cardData 角色卡 JSON 数据
 * @returns 包含角色数据的 PNG Blob
 */
export async function embedDataIntoPng(
  originalPng: ArrayBuffer | null,
  cardData: object
): Promise<Blob> {
  // 将卡片数据转为 JSON 并 base64 编码
  const jsonString = JSON.stringify(cardData);
  const jsonBytes = new TextEncoder().encode(jsonString);

  // gzip 压缩（可选，这里直接 base64）
  let base64String = '';
  try {
    // 使用 pako 进行 gzip 压缩会更好，但这里简化处理
    const binaryString = String.fromCharCode(...jsonBytes);
    base64String = btoa(binaryString);
  } catch {
    // 如果有 unicode 字符，使用 encodeURIComponent
    base64String = btoa(unescape(encodeURIComponent(jsonString)));
  }

  // 构建 tEXt chunk
  const keyword = 'ccv3';
  const keywordBytes = new TextEncoder().encode(keyword);
  const base64Bytes = new TextEncoder().encode(base64String);

  // tEXt chunk 格式: keyword + \0 + text
  const textData = new Uint8Array(keywordBytes.length + 1 + base64Bytes.length);
  textData.set(keywordBytes, 0);
  textData[keywordBytes.length] = 0; // null separator
  textData.set(base64Bytes, keywordBytes.length + 1);

  // 如果有原始 PNG，修改它；否则创建一个简单的带数据的 PNG
  if (originalPng) {
    return embedIntoExistingPng(originalPng, textData);
  } else {
    return createMinimalPngWithText(textData);
  }
}

async function embedIntoExistingPng(originalPng: ArrayBuffer, textData: Uint8Array): Promise<Blob> {
  const bytes = new Uint8Array(originalPng);

  // PNG 签名 (8 bytes)
  const signature = bytes.slice(0, 8);

  // 读取所有 chunks
  const chunks: { type: string; data: Uint8Array; crc: Uint8Array }[] = [];
  let i = 8;
  while (i < bytes.length) {
    const view = new DataView(bytes.buffer, i);
    const length = view.getUint32(0);
    const type = new TextDecoder().decode(bytes.slice(i + 4, i + 8));
    const data = bytes.slice(i + 8, i + 8 + length);
    const crc = bytes.slice(i + 8 + length, i + 12 + length);
    chunks.push({ type, data, crc });
    i += 12 + length;
  }

  // 移除现有的 ccv3/chara tEXt chunks
  const filteredChunks = chunks.filter(c =>
    !(c.type === 'tEXt' || c.type === 'iTXt') ||
    !extractKeywordFromChunk(c.data).startsWith('ccv3') &&
    !extractKeywordFromChunk(c.data).startsWith('chara')
  );

  // 创建新的 tEXt chunk
  const newChunk = createTextChunk('ccv3', textData);

  // 找到 IHDR 后面的位置插入
  const ihdrIndex = filteredChunks.findIndex(c => c.type === 'IHDR');
  const beforeIhdr = filteredChunks.slice(0, ihdrIndex + 1);
  const afterIhdr = filteredChunks.slice(ihdrIndex + 1);

  // 组装新 PNG
  const allChunks = [...beforeIhdr, newChunk, ...afterIhdr];

  // 计算总大小
  let totalSize = 8; // signature
  for (const chunk of allChunks) {
    totalSize += 4 + 4 + chunk.data.length + 4; // length + type + data + crc
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;

  // 写入签名
  result.set(signature, offset);
  offset += 8;

  // 写入 chunks
  for (const chunk of allChunks) {
    const lengthView = new DataView(result.buffer, offset);
    lengthView.setUint32(0, chunk.data.length);
    offset += 4;

    result.set(new TextEncoder().encode(chunk.type), offset);
    offset += 4;

    result.set(chunk.data, offset);
    offset += chunk.data.length;

    // 计算 CRC
    const crcData = new Uint8Array(4 + chunk.data.length);
    crcData.set(new TextEncoder().encode(chunk.type), 0);
    crcData.set(chunk.data, 4);
    const crc = crc32(crcData);
    const crcView = new DataView(result.buffer, offset);
    crcView.setUint32(0, crc);
    offset += 4;
  }

  return new Blob([result], { type: 'image/png' });
}

function extractKeywordFromChunk(data: Uint8Array): string {
  let keyword = '';
  for (let i = 0; i < data.length && data[i] !== 0; i++) {
    keyword += String.fromCharCode(data[i]);
  }
  return keyword;
}

function createTextChunk(keyword: string, data: Uint8Array): { type: string; data: Uint8Array; crc: Uint8Array } {
  const keywordBytes = new TextEncoder().encode(keyword);
  const chunkData = new Uint8Array(keywordBytes.length + 1 + data.length - keywordBytes.length - 1);
  // 简化：直接使用传入的 data（已经包含 keyword + \0 + base64）
  return { type: 'tEXt', data, crc: new Uint8Array(4) };
}

async function createMinimalPngWithText(textData: Uint8Array): Promise<Blob> {
  // 创建一个最小的 1x1 PNG
  // PNG 签名
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (13 bytes data)
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, 1);  // width = 1
  ihdrView.setUint32(4, 1);  // height = 1
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type (RGB)
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk (minimal compressed image data)
  // 一个简单的 1x1 红色像素
  const compressedData = new Uint8Array([120, 156, 99, 248, 15, 4, 0, 0, 6, 0, 2]);
  const idatChunk = createChunk('IDAT', compressedData);

  // tEXt chunk
  const textChunk = createChunk('tEXt', textData);

  // IEND chunk
  const iendChunk = createChunk('IEND', new Uint8Array(0));

  // 组装
  const chunks = [ihdrChunk, idatChunk, textChunk, iendChunk];
  let totalSize = 8;
  for (const chunk of chunks) {
    totalSize += 12 + chunk.data.length;
  }

  const result = new Uint8Array(totalSize);
  result.set(signature, 0);
  let offset = 8;

  for (const chunk of chunks) {
    const view = new DataView(result.buffer, offset);
    view.setUint32(0, chunk.data.length);
    offset += 4;
    result.set(new TextEncoder().encode(chunk.type), offset);
    offset += 4;
    result.set(chunk.data, offset);
    offset += chunk.data.length;
    const crcData = new Uint8Array(4 + chunk.data.length);
    crcData.set(new TextEncoder().encode(chunk.type), 0);
    crcData.set(chunk.data, 4);
    view.setUint32(0, crc32(crcData), false);
    offset += 4;
  }

  return new Blob([result], { type: 'image/png' });
}

function createChunk(type: string, data: Uint8Array): { type: string; data: Uint8Array } {
  return { type, data };
}

// CRC32 计算
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;

  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}
