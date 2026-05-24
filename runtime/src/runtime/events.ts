import {
  createPrimaryEmailDraftArtifactPatch,
  createPrimaryEmailDraftArtifactSet,
} from "@overbase/builder-sdk/artifacts";
import type { BuilderAppFinalEvent } from "@overbase/builder-sdk/app-protocol";
import type { EmailDraft, EmailDraftPatch } from "@overbase/builder-sdk/email";

export function showInitialEmailDraft(params: {
  emailDraft: EmailDraft;
  questionText: string;
  selectedExamplesSlug: string;
  selectedExampleSlug: string;
}): BuilderAppFinalEvent[] {
  return [
    {
      type: "assistantComplete",
      text: `Check out this potential format your team could receive.\n\nYou can edit it using the Edit button and click Publish once you're happy with the format. Keep in mind that we're just designing the format of the email and we'll set up the data sources afterwards.\n\nOne question which might help me further improve the format is ${params.questionText}`,
    },
    {
      type: "appStatePatch",
      patch: {
        selectedExamplesSlug: params.selectedExamplesSlug,
        selectedExampleSlug: params.selectedExampleSlug,
        initialQuestionText: params.questionText,
      },
    },
    {
      type: "artifactSet",
      artifact: createPrimaryEmailDraftArtifactSet({
        value: params.emailDraft,
        visibility: "visible",
      }),
    },
    { type: "waitForUser" },
    completeTurn(),
  ];
}

export function patchVisibleEmailDraft(result: {
  text: string;
  patch: EmailDraftPatch | null;
}): BuilderAppFinalEvent[] {
  return [
    {
      type: "assistantComplete",
      text:
        result.text.trim() ||
        (result.patch ? "Updated the draft." : "No changes needed."),
    },
    {
      type: "artifactPatch",
      artifact: createPrimaryEmailDraftArtifactPatch({
        patch: result.patch,
      }),
    },
    completeTurn(),
  ];
}

export function completeTurn(): BuilderAppFinalEvent {
  return { type: "complete" };
}
