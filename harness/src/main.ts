import './styles.css';
import type { GuideChoiceQuestion, GuideQuestion } from '@overbase/builder-sdk/catalog';
import { postRuntimeEvents } from './post-runtime-events.js';
import {
	appendUserMessage,
	applyHarnessEvent,
	canUseSkippedRemaining,
	createHarnessSetup,
	createHarnessState,
	fetchBuilderManifest,
	getChoiceCustomAnswer,
	getGuide,
	getGuideAnswer,
	resetGuideAnswers,
	resetHarnessRun,
	setGuideAnswer,
	setSetupAction
} from './harness-state.js';

const state = createHarnessState();
let running = false;

function createStaticShell() {
	document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
		<section class="shell">
			<aside class="panel setup-panel">
				<div class="panel-header">
					<h1>Bring the Firm</h1>
					<div class="status" id="status">Loading</div>
				</div>
				<div id="manifestDetails" class="manifest-details"></div>
				<div class="segmented" role="group" aria-label="Guided setup action">
					<button id="submittedButton" type="button">Submitted</button>
					<button id="skippedButton" type="button">Skipped</button>
				</div>
				<div id="guideQuestions" class="guide-questions"></div>
				<details class="setup-preview">
					<summary>Generated initial message</summary>
					<pre id="initialMessage"></pre>
				</details>
				<details class="setup-preview">
					<summary>Run setup JSON</summary>
					<pre id="setupJson"></pre>
				</details>
				<label class="field">
					<span>Message</span>
					<textarea id="messageText" rows="7" placeholder="Answer the follow-up or refine the visible draft"></textarea>
				</label>
				<div class="button-row">
					<button id="startButton" type="button">Start Turn</button>
					<button id="continueButton" type="button">Continue Turn</button>
				</div>
				<div class="button-row secondary-actions">
					<button id="resetRunButton" type="button">Reset Run</button>
					<button id="resetAnswersButton" type="button">Reset Answers</button>
				</div>
			</aside>
			<main class="panel transcript-panel">
				<div class="panel-header">
					<h2>Transcript</h2>
				</div>
				<div id="transcript" class="transcript"></div>
				<div id="error" class="error" hidden></div>
			</main>
			<aside class="json-column">
				<section class="panel json-panel">
					<div class="panel-header">
						<h2>Visible Draft</h2>
					</div>
					<pre id="visibleDraft"></pre>
				</section>
				<section class="panel json-panel">
					<div class="panel-header">
						<h2>Hidden Draft</h2>
					</div>
					<pre id="hiddenDraft"></pre>
				</section>
				<section class="panel json-panel">
					<div class="panel-header">
						<h2>App State</h2>
					</div>
					<pre id="appState"></pre>
				</section>
				<section class="panel json-panel">
					<div class="panel-header">
						<h2>Events</h2>
					</div>
					<pre id="events"></pre>
				</section>
			</aside>
		</section>
	`;
}

createStaticShell();

function getElement<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);

	if (!element) {
		throw new Error(`Missing element: ${id}`);
	}

	return element as T;
}

const manifestDetails = getElement<HTMLDivElement>('manifestDetails');
const guideQuestions = getElement<HTMLDivElement>('guideQuestions');
const initialMessage = getElement<HTMLPreElement>('initialMessage');
const setupJson = getElement<HTMLPreElement>('setupJson');
const messageText = getElement<HTMLTextAreaElement>('messageText');
const startButton = getElement<HTMLButtonElement>('startButton');
const continueButton = getElement<HTMLButtonElement>('continueButton');
const submittedButton = getElement<HTMLButtonElement>('submittedButton');
const skippedButton = getElement<HTMLButtonElement>('skippedButton');
const resetRunButton = getElement<HTMLButtonElement>('resetRunButton');
const resetAnswersButton = getElement<HTMLButtonElement>('resetAnswersButton');
const status = getElement<HTMLDivElement>('status');
const transcript = getElement<HTMLDivElement>('transcript');
const visibleDraft = getElement<HTMLPreElement>('visibleDraft');
const hiddenDraft = getElement<HTMLPreElement>('hiddenDraft');
const appState = getElement<HTMLPreElement>('appState');
const events = getElement<HTMLPreElement>('events');
const error = getElement<HTMLDivElement>('error');

function formatJson(value: unknown) {
	return JSON.stringify(value, null, 2);
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function getDraftByVisibility(visibility: 'hidden' | 'visible') {
	const artifact = state.hostState.artifacts.primary;

	return artifact?.visibility === visibility ? artifact : null;
}

function renderTranscript() {
	const messages = state.streamText
		? [...state.transcript, { role: 'assistant' as const, text: state.streamText }]
		: state.transcript;

	transcript.innerHTML = messages
		.map(
			(message) => `
				<article class="message ${message.role}">
					<div class="message-role">${message.role}</div>
					<div class="message-text">${escapeHtml(message.text)}</div>
				</article>
			`
		)
		.join('');
}

function renderChoiceQuestion(question: GuideChoiceQuestion) {
	const selectedAnswer = getGuideAnswer(state, question.id);
	const customAnswer = getChoiceCustomAnswer(state, question);
	const options = question.options
		.map(
			(option) => `
				<label class="choice-option">
					<input
						type="radio"
						name="${question.id}"
						value="${escapeHtml(option)}"
						${selectedAnswer === option ? 'checked' : ''}
					/>
					<span>${escapeHtml(option)}</span>
				</label>
			`
		)
		.join('');

	return `
		<section class="guide-question" data-question-id="${question.id}">
			<div class="question-title">${escapeHtml(question.title)}</div>
			${question.helpText ? `<div class="question-help">${escapeHtml(question.helpText)}</div>` : ''}
			<div class="choice-list">${options}</div>
			<input
				class="custom-answer"
				type="text"
				value="${escapeHtml(customAnswer)}"
				placeholder="${escapeHtml(question.customAnswerPlaceholder)}"
			/>
		</section>
	`;
}

function renderTextQuestion(question: GuideQuestion) {
	if (question.type !== 'text') {
		return '';
	}

	return `
		<section class="guide-question" data-question-id="${question.id}">
			<label class="field">
				<span>${escapeHtml(question.title)}</span>
				${question.helpText ? `<small>${escapeHtml(question.helpText)}</small>` : ''}
				<textarea class="text-answer" rows="4" placeholder="${escapeHtml(question.placeholder)}">${escapeHtml(
					getGuideAnswer(state, question.id)
				)}</textarea>
			</label>
		</section>
	`;
}

function renderGuideQuestions() {
	const guide = getGuide(state);

	guideQuestions.innerHTML =
		guide?.questions
			.map((question) =>
				question.type === 'choice' ? renderChoiceQuestion(question) : renderTextQuestion(question)
			)
			.join('') ?? '';
}

function renderSetupPreview() {
	if (!state.manifest) {
		initialMessage.textContent = '';
		setupJson.textContent = '';
		return;
	}

	const setup = createHarnessSetup(state);
	initialMessage.textContent = setup.initialMessage;
	setupJson.textContent = formatJson(setup);
}

function renderManifest() {
	const manifest = state.manifest;

	manifestDetails.innerHTML = manifest
		? `
			<div class="manifest-title">${escapeHtml(manifest.title)}</div>
			<div class="manifest-description">${escapeHtml(manifest.description)}</div>
			${getGuide(state)?.intro ? `<div class="guide-intro">${escapeHtml(getGuide(state)?.intro ?? '')}</div>` : ''}
		`
		: '';
}

function syncSetupControls() {
	const loaded = Boolean(state.manifest);
	const skippedAvailable = canUseSkippedRemaining(state);

	startButton.disabled = running || !loaded;
	continueButton.disabled = running || !loaded;
	submittedButton.disabled = running || !loaded;
	skippedButton.disabled = running || !loaded || !skippedAvailable;
	resetRunButton.disabled = running || !loaded;
	resetAnswersButton.disabled = running || !loaded;
	messageText.disabled = running || !loaded;
	status.textContent = running ? 'Running' : loaded ? 'Idle' : 'Loading';
	submittedButton.classList.toggle('active', state.setupAction === 'submitted');
	skippedButton.classList.toggle('active', state.setupAction === 'skippedRemaining');
}

function syncGuideQuestionControls() {
	const guide = getGuide(state);

	if (!guide) {
		return;
	}

	for (const question of guide.questions) {
		const answer = getGuideAnswer(state, question.id);
		const questionElement = [...guideQuestions.querySelectorAll<HTMLElement>('.guide-question')].find(
			(element) => element.dataset.questionId === question.id
		);

		if (!questionElement) {
			continue;
		}

		if (question.type === 'choice') {
			questionElement.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((input) => {
				input.checked = answer === input.value;
			});

			const customAnswer = questionElement.querySelector<HTMLInputElement>('.custom-answer');
			const customValue = question.options.includes(answer) ? '' : answer;

			if (customAnswer && customAnswer.value !== customValue) {
				customAnswer.value = customValue;
			}

			continue;
		}

		const textarea = questionElement.querySelector<HTMLTextAreaElement>('.text-answer');

		if (textarea && textarea.value !== answer) {
			textarea.value = answer;
		}
	}
}

function syncJsonPanels() {
	visibleDraft.textContent = formatJson(getDraftByVisibility('visible'));
	hiddenDraft.textContent = formatJson(getDraftByVisibility('hidden'));
	appState.textContent = formatJson(state.hostState.appState);
	events.textContent = formatJson(state.events.slice(-30));
}

function syncError() {
	error.hidden = !state.errorText;
	error.textContent = state.errorText ?? '';
}

function syncView() {
	syncSetupControls();
	syncGuideQuestionControls();
	renderSetupPreview();
	renderTranscript();
	syncJsonPanels();
	syncError();
}

async function runWithStatus(task: () => Promise<void>) {
	running = true;
	state.errorText = null;
	syncView();

	try {
		await task();
	} catch (runError) {
		state.errorText = runError instanceof Error ? runError.message : 'Runtime request failed.';
	} finally {
		running = false;
		syncView();
	}
}

guideQuestions.addEventListener('change', (event) => {
	const input = event.target instanceof HTMLInputElement ? event.target : null;

	if (!input?.matches('input[type="radio"]') || !input.checked) {
		return;
	}

	setGuideAnswer(state, input.name, input.value);
	syncView();
});

guideQuestions.addEventListener('input', (event) => {
	const input = event.target;

	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
		return;
	}

	if (!input.matches('.custom-answer, .text-answer')) {
		return;
	}

	const question = input.closest<HTMLElement>('.guide-question');

	if (!question) {
		return;
	}

	setGuideAnswer(state, question.dataset.questionId ?? '', input.value);
	syncView();
});

submittedButton.addEventListener('click', () => {
	setSetupAction(state, 'submitted');
	syncView();
});

skippedButton.addEventListener('click', () => {
	setSetupAction(state, 'skippedRemaining');
	syncView();
});

resetRunButton.addEventListener('click', () => {
	resetHarnessRun(state);
	syncView();
});

resetAnswersButton.addEventListener('click', () => {
	resetGuideAnswers(state);
	syncView();
});

startButton.addEventListener('click', () => {
	void runWithStatus(async () => {
		const setup = createHarnessSetup(state);
		resetHarnessRun(state);
		appendUserMessage(state, setup.initialMessage);

		await postRuntimeEvents({
			body: {
				action: 'start',
				input: {
					setup,
					artifacts: state.hostState.artifacts,
					appState: state.hostState.appState
				}
			},
			onEvent(event) {
				applyHarnessEvent(state, event);
				syncView();
			}
		});
	});
});

continueButton.addEventListener('click', () => {
	void runWithStatus(async () => {
		const message = messageText.value.trim();

		if (!message) {
			return;
		}

		appendUserMessage(state, message);
		messageText.value = '';
		syncView();

		await postRuntimeEvents({
			body: {
				action: 'continue',
				input: {
					setup: createHarnessSetup(state),
					transcript: state.transcript,
					userMessage: message,
					artifacts: state.hostState.artifacts,
					appState: state.hostState.appState
				}
			},
			onEvent(event) {
				applyHarnessEvent(state, event);
				syncView();
			}
		});
	});
});

void runWithStatus(async () => {
	state.manifest = await fetchBuilderManifest();
	renderManifest();
	renderGuideQuestions();
});
