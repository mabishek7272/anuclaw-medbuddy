export interface InboundMessage {
  id: string;
  groupId: string;
  channel: string;
  senderId: string;
  senderName: string;
  text: string;
  /** Path to a media file if the message contains an image/voice/document */
  mediaPath?: string;
  mediaType?: 'image' | 'voice' | 'video' | 'document';
  timestamp: Date;
  /** Whether this message mentions/triggers the bot */
  isTrigger: boolean;
}

export interface OutboundMessage {
  groupId: string;
  channel: string;
  text: string;
  /** Optional file path to attach */
  filePath?: string;
  mimeType?: string;
  /** Reply to a specific message id */
  replyToId?: string;
}

export interface IChannel {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(msg: OutboundMessage): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
}
