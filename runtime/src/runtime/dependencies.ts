import type { OpenAIConfig, OpenAIModelProfile } from '@overbase/builder-sdk/openai';

export type RuntimeEnv = Record<string, string | undefined>;

export type RuntimeDependencies = {
	getOpenAIConfig: (profile?: OpenAIModelProfile) => OpenAIConfig;
	overbaseSecret: string | undefined;
};
