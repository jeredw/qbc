/**
 * MIDI player element.
 * See also the [`@magenta/music/core/player` docs](https://magenta.github.io/magenta-js/music/modules/_core_player_.html).
 *
 * The element supports styling using the CSS [`::part` syntax](https://developer.mozilla.org/docs/Web/CSS/::part)
 * (see the list of shadow parts [below](#css-shadow-parts)). For example:
 * ```css
 * midi-player::part(control-panel) {
 *     background: aquamarine;
 *     border-radius: 0px;
 * }
 * ```
 *
 * @prop src - MIDI file URL
 * @prop soundFont - Magenta SoundFont URL, an empty string to use the default SoundFont, or `null` to use a simple oscillator synth
 * @prop loop - Indicates whether the player should loop
 * @prop currentTime - Current playback position in seconds
 * @prop duration - Content duration in seconds
 * @prop playing - Indicates whether the player is currently playing
 *
 * @fires load - The content is loaded and ready to play
 * @fires start - The player has started playing
 * @fires stop - The player has stopped playing
 * @fires loop - The player has automatically restarted playback after reaching the end
 * @fires note - A note starts
 *
 * @csspart control-panel - `<div>` containing all the controls
 * @csspart play-button - Play button
 * @csspart time - Numeric time indicator
 * @csspart current-time - Elapsed time
 * @csspart total-time - Total duration
 * @csspart seek-bar - `<input type="range">` showing playback position
 * @csspart loading-overlay - Overlay with shimmer animation
 */
export declare class PlayerElement extends HTMLElement {
    private domInitialized;
    private initTimeout;
    private needInitNs;
    protected controlPanel: HTMLElement;
    protected playButton: HTMLButtonElement;
    protected seekBar: HTMLInputElement;
    protected currentTimeLabel: HTMLInputElement;
    protected totalTimeLabel: HTMLInputElement;
    protected visualizerListeners: any;
    protected _playing: boolean;
    protected seeking: boolean;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    attributeChangedCallback(name: string, _oldValue: string, newValue: string): void;
    protected initPlayer(initNs?: boolean): void;
    protected initPlayerNow(initNs?: boolean): Promise<void>;
    reload(): void;
    start(): void;
    protected _start(looped?: boolean): void;
    stop(): void;
    protected handleStop(finished?: boolean): void;
    protected setVisualizerSelector(selector: string): void;
    protected setLoading(): void;
    protected setLoaded(): void;
    protected setError(error: string): void;
    get src(): string | null;
    set src(value: string | null);
    /**
     * @attr sound-font
     */
    get soundFont(): string | null;
    set soundFont(value: string | null);
    /**
     * @attr loop
     */
    get loop(): boolean;
    set loop(value: boolean);
    get currentTime(): number;
    set currentTime(value: number);
    protected displayCurrentTime(value: number): void;
    get duration(): number;
    get playing(): boolean;
    protected setOrRemoveAttribute(name: string, value: string): void;
}
