import { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessage } from '@shared/protocol';

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  streamContent: string;
  onSendMessage: (content: string) => void;
  disabled: boolean;
}

export function ChatPanel({ messages, streaming, streamContent, onSendMessage, disabled }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  // Auto-resize textarea
  const handleInput = useCallback((value: string) => {
    setInput(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming || disabled) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, streaming, disabled, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="chat-panel">
      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <div className="chat-messages__empty">
            <div className="chat-messages__empty-icon">✦</div>
            <div className="chat-messages__empty-title">准备开始创作</div>
            <div className="chat-messages__empty-hint">
              告诉我你想创作什么样的角色卡，比如：<br />
              「创建一个宝可梦主题的冒险故事」<br />
              「帮我写一个赛博朋克世界的恋爱故事卡」<br />
              「我想做一个克苏鲁风格的调查类角色卡」
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.toolCalls) {
            return (
              <div key={msg.id} className="tool-indicator">
                {msg.content}
              </div>
            );
          }
          return (
            <div
              key={msg.id}
              className={`message message--${msg.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div className="message__avatar">
                {msg.role === 'user' ? '👤' : '✦'}
              </div>
              <div className="message__content">
                {msg.content.split('\n').map((line, i) => (
                  <p key={i}>{line || '\u00A0'}</p>
                ))}
              </div>
            </div>
          );
        })}

        {/* Streaming content */}
        {streaming && streamContent && (
          <div className="message message--assistant">
            <div className="message__avatar">✦</div>
            <div className="message__content">
              {streamContent.split('\n').map((line, i) => (
                <p key={i}>{line || '\u00A0'}</p>
              ))}
              <span className="streaming-dot" />
            </div>
          </div>
        )}

        {/* Streaming without content yet */}
        {streaming && !streamContent && (
          <div className="message message--assistant">
            <div className="message__avatar">✦</div>
            <div className="message__content">
              <span className="streaming-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input">
        <div className="chat-input__wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input__textarea"
            placeholder={disabled ? '等待连接...' : '描述你想创作的角色卡，或给出具体指示...'}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || streaming}
            rows={1}
          />
          <button
            className="chat-input__send"
            onClick={handleSend}
            disabled={!input.trim() || streaming || disabled}
            title="发送 (Enter)"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
