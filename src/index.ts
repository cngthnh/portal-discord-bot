import { config } from "dotenv";
import { play } from "@/actions/play";
config();

import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.MessageContent
    ],
});
const token = process.env.BOT_TOKEN;
const prefix = "!";
// Đây là tiền tố trước mỗi lệnh mà ta ra hiệu cho bot từ khung chat.
// Lệnh có dạng như sau "!play Nhạc Đen Vâu", "!pause",...

client.on("messageCreate", (message) => {
    const args = message.content.substring(prefix.length).split(" ");
    const content = message.content.substring(prefix.length + args[0].length);
    console.log(message.content)

    if (message.content.startsWith(prefix)) {
        switch (args[0]) {
            case play.name:
                play.execute(message, content);
        }
    }
});

client.on("ready", () => {
    console.log("🏃‍♀️ The Portal is online! 💨");
});

client.once("reconnecting", () => {
    console.log("🔗 Reconnecting!");
});

client.once("disconnect", () => {
    console.log("🛑 Disconnected!");
});

client.login(token);
