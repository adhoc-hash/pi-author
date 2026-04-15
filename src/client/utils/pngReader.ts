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
