import { Platform, Song } from '@/types/Song';
import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnection,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { Snowflake } from 'discord.js';
import ytdl from 'ytdl-core';

export interface QueueItem {
  song: Song;
  requester: string;
}

export class Server {
  public guildId: string;
  public playing?: QueueItem;
  public queue: QueueItem[];
  public readonly voiceConnection: VoiceConnection;
  public readonly audioPlayer: AudioPlayer;
  private isReady = false;

  constructor(voiceConnection: VoiceConnection, guildId: string) {
    this.voiceConnection = voiceConnection;
    this.audioPlayer = createAudioPlayer();
    this.queue = [];
    this.playing = undefined;
    this.guildId = guildId;

    this.voiceConnection.on('stateChange', async (_, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        /*
          Nếu websocket đã bị đóng với mã 4014 có 2 khả năng:
          - Nếu nó có khả năng tự kết nối lại (có khả năng do chuyển kênh thoại), ta cho dảnh ra 5s để tìm hiểu và cho kết nối lại.
          - Nếu bot bị kick khỏi kênh thoại, ta sẽ phá huỷ kết nối.
        */
        if (
          newState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
          newState.closeCode === 4014
        ) {
          try {
            await entersState(
              this.voiceConnection,
              VoiceConnectionStatus.Connecting,
              5_000,
            );
          } catch (e) {
            this.leave();
          }
        } else if (this.voiceConnection.rejoinAttempts < 5) {
          this.voiceConnection.rejoin();
        } else {
          this.leave();
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.leave();
      } else if (
        !this.isReady &&
        (newState.status === VoiceConnectionStatus.Connecting ||
          newState.status === VoiceConnectionStatus.Signalling)
      ) {
        /*
          Nếu tín hiệu kết nối ở trạng thái "Connecting" hoặc "Signalling", ta sẽ đợi 20s để kết nối sẵn sàng.
          Sau 20s nếu kết nối không thành công, ta sẽ phá huỷ kết nối.
        */
        this.isReady = true;
        try {
          await entersState(
            this.voiceConnection,
            VoiceConnectionStatus.Ready,
            20_000,
          );
        } catch {
          if (
            this.voiceConnection.state.status !==
            VoiceConnectionStatus.Destroyed
          )
            this.voiceConnection.destroy();
        } finally {
          this.isReady = false;
        }
      }
    });

    // Đây là sự kiện khi một bài hát kết thúc và ta chuyển sang bài mới.
    this.audioPlayer.on('stateChange', async (oldState, newState) => {
      if (
        newState.status === AudioPlayerStatus.Idle &&
        oldState.status !== AudioPlayerStatus.Idle
      ) {
        await this.play();
      }
    });

    voiceConnection.subscribe(this.audioPlayer);
  }

  public async addSongs(queueItems: QueueItem[]): Promise<void> {
    this.queue = this.queue.concat(queueItems);
    if (!this.playing) {
      await this.play();
    }
  }

  public stop(): void {
    this.playing = undefined;
    this.queue = [];
    this.audioPlayer.stop();
  }

  // Bot rời khỏi kênh thoại và xoá server hiện tại khỏi map.
  public leave(): void {
    if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.voiceConnection.destroy();
    }
    this.stop();
    servers.delete(this.guildId);
  }

  // Dừng bài hát đang phát
  public pause(): void {
    this.audioPlayer.pause();
  }

  // Tiếp tục bài hát bị dừng
  public resume(): void {
    this.audioPlayer.unpause();
  }

  // Chuyển tới bài hát trong queue
  public async jump(position: number): Promise<QueueItem> {
    const target = this.queue[position - 1];
    this.queue = this.queue
      .splice(0, position - 1)
      .concat(this.queue.splice(position, this.queue.length - 1));
    this.queue.unshift(target);
    await this.play();
    return target;
  }

  // Xoá bài hát trong queue
  public remove(position: number): QueueItem {
    return this.queue.splice(position - 1, 1)[0];
  }

  public async play(): Promise<void> {
    try {
      // Phát bài hát đầu tiên trong queue nếu queue không rỗng
      if (this.queue.length > 0) {
        this.playing = this.queue.shift() as QueueItem;
        let stream: any;
        const highWaterMark = 1024 * 1024 * 10;
        if (this.playing?.song.platform === Platform.YOUTUBE) {
          stream = ytdl(this.playing.song.url, {
            highWaterMark,
            filter: 'audioonly',
            quality: 'highestaudio',
          });
        } else {
          // stream = await scdl.download(this.playing.song.url, {
          //   highWaterMark,
          // });
        }
        const audioResource = createAudioResource(stream);
        this.audioPlayer.play(audioResource);
      } else {
        // Dừng việc phát nhạc, gán thuộc tính playing = undefined
        this.playing = undefined;
        this.audioPlayer.stop();
      }
    } catch (e) {
      // Nếu việc stream 1 bài hát có trục trặc gì, thì ta sẽ phát tiếp tục bài hát tiếp theo
      this.play();
    }
  }
}

// Map các server mà bot đang trong kênh thoại
export const servers = new Map<Snowflake, Server>();
