import messages from '@/constants/messages';
import { QueueItem, Server, servers } from '@/models/server';
import { YoutubeService } from '@/services/youtube';
import { Platform } from '@/types/Song';
import fetch from 'node-fetch';
import {
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import configs from '@/constants/configs';
import { GuildMember, Message } from 'discord.js';
import { createPlayMessage } from '@/interactions/play_messages';

export const stream = {
    name: 'stream',
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
            const media = await YoutubeService.getVideoDetails(content);
            let metadata: any = null;
            if (
                message.member instanceof GuildMember &&
                message.member.voice.channel
            ) {
                metadata = {
                    title: media.title,
                    url: media.url,
                    author: media.author,
                    thumbnail: media.thumbnail,
                    type: 'Song',
                    length: media.length,
                    platform: Platform.YOUTUBE,
                    requester: message.member?.user.username as string,
                    channel: message.member.voice.channel.name,
                    guild: message.member.voice.channel.guild.name
                };
            }
            if (metadata) {
                await fetch(configs.PORTAL_STREAM_SERVICE_URL + configs.PORTAL_STREAM_START, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(metadata)
                })
                    .then(response => response.json())
                    .then((response: any) => {
                        message.channel.send({
                            embeds: [
                                createPlayMessage({ ...metadata, url: configs.PORTAL_STREAM_DASHBOARD + '?session=' + response.token }),
                            ],
                        });
                    })
            }

        } catch (error) {
            await message.channel.send(messages.failToPlay);
        }
    },
};
