/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { Message } from 'ai';
import React, { type RefCallback, useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { APIKeyManager } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';

import styles from './BaseChat.module.scss';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';

import FilePreview from './FilePreview';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { toast } from 'react-toastify';

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string, simulation?: boolean) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  onRewind?: (messageId: string, contents: string) => void;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      onRewind,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');

    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      // Load API keys from cookies on component mount

      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string, simulation?: boolean) => {
      if (sendMessage) {
        sendMessage(event, messageInput, simulation);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div ref={scrollRef} className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[16vh] max-w-chat mx-auto text-center px-4 lg:px-0">
                <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
                  Get unstuck
                </h1>
                <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
                  Fix tough bugs and get your app working right.
                </p>
              </div>
            )}
            <div
              className={classNames('pt-6 px-2 sm:px-6', {
                'h-full flex flex-col': chatStarted,
              })}
            >
              <ClientOnly>
                {() => {
                  return chatStarted ? (
                    <Messages
                      ref={messageRef}
                      className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                      onRewind={onRewind}
                    />
                  ) : null;
                }}
              </ClientOnly>
              <div
                className={classNames(
                  'bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor relative w-full max-w-chat mx-auto z-prompt mb-6',
                  {
                    'sticky bottom-2': chatStarted,
                  },
                )}
              >
                <svg className={classNames(styles.PromptEffectContainer)}>
                  <defs>
                    <linearGradient
                      id="line-gradient"
                      x1="20%"
                      y1="0%"
                      x2="-14%"
                      y2="10%"
                      gradientUnits="userSpaceOnUse"
                      gradientTransform="rotate(-45)"
                    >
                      <stop offset="0%" stopColor="#b44aff" stopOpacity="0%"></stop>
                      <stop offset="40%" stopColor="#b44aff" stopOpacity="80%"></stop>
                      <stop offset="50%" stopColor="#b44aff" stopOpacity="80%"></stop>
                      <stop offset="100%" stopColor="#b44aff" stopOpacity="0%"></stop>
                    </linearGradient>
                    <linearGradient id="shine-gradient">
                      <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
                      <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
                      <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
                      <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
                    </linearGradient>
                  </defs>
                  <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
                  <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
                </svg>
                <FilePreview
                  files={uploadedFiles}
                  imageDataList={imageDataList}
                  onRemove={(index) => {
                    setUploadedFiles?.(uploadedFiles.filter((_, i) => i !== index));
                    setImageDataList?.(imageDataList.filter((_, i) => i !== index));
                  }}
                />
                <ClientOnly>
                  {() => (
                    <ScreenshotStateManager
                      setUploadedFiles={setUploadedFiles}
                      setImageDataList={setImageDataList}
                      uploadedFiles={uploadedFiles}
                      imageDataList={imageDataList}
                    />
                  )}
                </ClientOnly>
                <div
                  className={classNames(
                    'relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg',
                  )}
                >
                  <textarea
                    ref={textareaRef}
                    className={classNames(
                      'w-full pl-4 pt-4 pr-25 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',
                      'transition-all duration-200',
                      'hover:border-bolt-elements-focus',
                    )}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.border = '2px solid #1488fc';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.border = '2px solid #1488fc';
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

                      const files = Array.from(e.dataTransfer.files);
                      files.forEach((file) => {
                        if (file.type.startsWith('image/')) {
                          const reader = new FileReader();

                          reader.onload = (e) => {
                            const base64Image = e.target?.result as string;
                            setUploadedFiles?.([...uploadedFiles, file]);
                            setImageDataList?.([...imageDataList, base64Image]);
                          };
                          reader.readAsDataURL(file);
                        }
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        if (event.shiftKey) {
                          return;
                        }

                        event.preventDefault();

                        if (isStreaming) {
                          handleStop?.();
                          return;
                        }

                        // ignore if using input method engine
                        if (event.nativeEvent.isComposing) {
                          return;
                        }

                        handleSendMessage?.(event);
                      }
                    }}
                    value={input}
                    onChange={(event) => {
                      handleInputChange?.(event);
                    }}
                    onPaste={handlePaste}
                    style={{
                      minHeight: TEXTAREA_MIN_HEIGHT,
                      maxHeight: TEXTAREA_MAX_HEIGHT,
                    }}
                    placeholder={chatStarted ? "How can we help you?" : "What do you want to build?"}
                    translate="no"
                  />
                  <ClientOnly>
                    {() => (
                      <>
                        <SendButton
                          show={input.length > 0 || isStreaming || uploadedFiles.length > 0}
                          fixBug={false}
                          isStreaming={isStreaming}
                          onClick={(event) => {
                            if (isStreaming) {
                              handleStop?.();
                              return;
                            }

                            if (input.length > 0 || uploadedFiles.length > 0) {
                              handleSendMessage?.(event);
                            }
                          }}
                        />
                        <SendButton
                          show={(input.length > 0 || uploadedFiles.length > 0) && chatStarted}
                          fixBug={true}
                          isStreaming={isStreaming}
                          onClick={(event) => {
                            if (input.length > 0 || uploadedFiles.length > 0) {
                              handleSendMessage?.(event, undefined, true);
                            }
                          }}
                        />
                      </>
                    )}
                  </ClientOnly>
                  <div className="flex justify-between items-center text-sm p-4 pt-2">
                    <div className="flex gap-1 items-center">
                      <IconButton title="Upload file" className="transition-all" onClick={() => handleFileUpload()}>
                        <div className="i-ph:paperclip text-xl"></div>
                      </IconButton>

                      <SpeechRecognitionButton
                        isListening={isListening}
                        onStart={startListening}
                        onStop={stopListening}
                        disabled={isStreaming}
                      />
                      {chatStarted && <ClientOnly>{() => <ExportChatButton exportChat={exportChat} />}</ClientOnly>}
                    </div>
                    {input.length > 3 ? (
                      <div className="text-xs text-bolt-elements-textTertiary">
                        Use <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd> +{' '}
                        <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Return</kbd> a
                        new line
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {!chatStarted && (
              <div className="flex justify-center gap-2">
                <ImportButtons importChat={importChat} />
                <GitCloneButton importChat={importChat} />
              </div>
            )}
            {!chatStarted &&
              ExamplePrompts((event, messageInput) => {
                if (isStreaming) {
                  handleStop?.();
                  return;
                }

                handleSendMessage?.(event, messageInput);
              })}
          </div>
          <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);
