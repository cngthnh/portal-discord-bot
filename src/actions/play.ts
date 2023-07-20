import messages from '@/constants/messages';
import { QueueItem, Server, servers } from '@/models/server';
import { YoutubeService } from '@/services/youtube';
import { Platform } from '@/types/Song';
import {
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import { GuildMember, Message } from 'discord.js';
import { createPlayMessage } from '@/interactions/play_messages';

export const play = {
    name: 'play',
    execute: async (message: Message, content: string): Promise<void> => {
        let server = servers.get(message.guildId as string);
        if (!server) {
            if (
                message.member instanceof GuildMember &&
                message.member.voice.channel
            ) {
                const channel = message.member.voice.channel;
                server = new Server(
                    joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                    }),
                    message.guildId as string,
                );
                servers.set(message.guildId as string, server);
            }
        }

        if (!server) {
            await message.channel.send(messages.joinVoiceChannel);
            return;
        }

        // Make sure the connection is ready before processing the user's request
        try {
            await entersState(
                server.voiceConnection,
                VoiceConnectionStatus.Ready,
                20e3,
            );
        } catch (error) {
            await message.channel.send(messages.failToJoinVoiceChannel);
            return;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const playListId = YoutubeService.isPlaylist(content);
            if (playListId) {
                const playlist = await YoutubeService.getPlaylist(playListId);
                const songs = playlist.songs.map((song) => {
                    const queueItem: QueueItem = {
                        song,
                        requester: message.member?.user.username as string,
                    };
                    return queueItem;
                });
                await server.addSongs(songs);
                message.channel.send({
                    embeds: [
                        createPlayMessage({
                            title: playlist.title,
                            url: content,
                            author: playlist.author,
                            thumbnail: playlist.thumbnail,
                            type: 'Playlist',
                            length: playlist.songs.length,
                            platform: Platform.YOUTUBE,
                            requester: message.member?.user.username as string,
                        }),
                    ],
                });
            } else {
                const song = await YoutubeService.getVideoDetails(content);
                const queueItem: QueueItem = {
                    song,
                    requester: message.member?.user.username as string,
                };
                await server.addSongs([queueItem]);
                message.channel.send({
                    embeds: [
                        createPlayMessage({
                            title: song.title,
                            url: song.url,
                            author: song.author,
                            thumbnail: song.thumbnail,
                            type: 'Song',
                            length: song.length,
                            platform: Platform.YOUTUBE,
                            requester: message.member?.user.username as string,
                        }),
                    ],
                });
            }
        } catch (error) {
            await message.channel.send(messages.failToPlay);
        }
    },
};
