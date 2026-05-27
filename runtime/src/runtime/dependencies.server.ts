import { getOpenAIConfig } from '@overbase/builder-sdk/openai';
import type { RuntimeDependencies, RuntimeEnv } from './dependencies.js';

export function createServerDependencies(
	env: RuntimeEnv = process.env
): RuntimeDependencies {
	return {
		getOpenAIConfig(profile = 'default') {
			return getOpenAIConfig({
				profile,
				apiKey: env.OPENAI_API_KEY,
				chatModel: env.OPENAI_CHAT_MODEL,
				fastChatModel: env.OPENAI_FAST_CHAT_MODEL,
				reasoningEffort: env.OPENAI_REASONING_EFFORT,
				fastReasoningEffort: env.OPENAI_FAST_REASONING_EFFORT
			});
		},
		overbaseSecret: env.BRING_THE_FIRM_BUILDER_OVERBASE_SECRET
	};
}
