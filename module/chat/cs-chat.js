import LOGGER from "../utils/logger.js";

export default class CSChat {
    static ChatDataSetup(content, modeOverride, isRoll = false, forceWhisper) {
        LOGGER.trace("ChatDataSetup | CSChat | Called.");
        const chatData = {
            user: game.user.id,
            rollMode: modeOverride || game.settings.get("core", "rollMode"),
            content,
        };

        if (["gmroll", "blindroll"].includes(chatData.rollMode)) {
            chatData.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
        }

        if (chatData.rollMode === "blindroll") {
            chatData.blind = true;
        } else if (chatData.rollMode === "selfroll") {
            chatData.whisper = [game.user];
        }

        if (forceWhisper) {
            chatData.speaker = ChatMessage.getSpeaker();
            chatData.whisper = ChatMessage.getWhisperRecipients(forceWhisper);
        }

        return chatData;
    }

    static RenderRollCard(incomingRoll) {
        LOGGER.trace("RenderRollCard | CSChat | Called.");

        const csRoll = incomingRoll;

        return renderTemplate(csRoll.rollCard, csRoll).then((html) => {
            const chatOptions = this.ChatDataSetup(html);

            if (csRoll.entityData !== undefined && csRoll.entityData !== null) {
                let actor;
                const actorId = csRoll.entityData.actor;
                const tokenId = csRoll.entityData.token;
                if (tokenId) {
                    actor = (Object.keys(game.actors.tokens).includes(tokenId))
                        ? game.actors.tokens[tokenId]
                        : game.actors.find((a) => a.id === actorId);
                } else {
                    [actor] = game.actors.filter((a) => a.id === actorId);
                }
                const alias = actor.name;
                chatOptions.speaker = { actor, alias };
            }
            return ChatMessage.create(chatOptions, false);
        });
    }
}
