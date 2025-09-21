import { Statement } from "./Statement.ts";
import { ExecutionContext } from "./ExecutionContext.ts";
import { ControlFlow, ControlFlowTag } from "../ControlFlow.ts";
import { BuiltinStatementArgs } from "../Builtins.ts";
import { evaluateIntegerExpression, evaluateStringExpression, Expression } from "../Expressions.ts";
import { RuntimeError, ILLEGAL_FUNCTION_CALL, OUT_OF_STACK_SPACE } from "../Errors.ts";
import { integer, isString } from "../Values.ts";
import { TypeTag } from "../Types.ts";
import { Token } from "antlr4ng";
import { PlayState } from "../Speaker.ts";
import { Variable } from "../Variables.ts";
import { stringToAscii } from "../AsciiChart.ts";

export class BeepStatement extends Statement {
  constructor() {
    super()
  }

  override execute(context: ExecutionContext): ControlFlow {
    const promise = context.devices.speaker.beep();
    return {tag: ControlFlowTag.WAIT, promise};
  }
}

const TICKS_PER_SECOND = 1193180 / 65535;

export class SoundStatement extends Statement {
  frequency: Expression;
  duration: Expression;

  constructor(private args: BuiltinStatementArgs) {
    super();
    this.frequency = this.args.params[0].expr!;
    this.duration = this.args.params[1].expr!;
  }

  execute(context: ExecutionContext): ControlFlow | void {
    const frequency = evaluateIntegerExpression(this.frequency, context.memory);
    if (frequency < 37 && frequency !== 0) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
    // The help file claims the duration argument is an integer, but that's
    // plainly a lie - tons of sound effect loops use fractional durations.
    const duration = evaluateIntegerExpression(this.duration, context.memory, { tag: TypeTag.SINGLE });
    if (duration < 0 || duration > 65535) {
      throw RuntimeError.fromToken(this.args.token, ILLEGAL_FUNCTION_CALL);
    }
    const promise = context.devices.speaker.tone(frequency, duration / TICKS_PER_SECOND, 0);
    return {tag: ControlFlowTag.WAIT, promise};
  }
}

export class PlayFunction extends Statement {
  constructor(private result: Variable) {
    super();
  }

  execute(context: ExecutionContext) {
    const queueLength = context.devices.speaker.getNoteQueueLength();
    context.memory.write(this.result, integer(queueLength));
  }
}

export class PlayStatement extends Statement {
  constructor(
    private token: Token,
    private commandString: Expression
  ) {
    super();
  }

  execute(context: ExecutionContext): ControlFlow {
    const {speaker} = context.devices;
    const commandString = evaluateStringExpression(this.commandString, context.memory);
    const state = speaker.getPlayState();
    let song: Song;
    try {
      song = parsePlayCommandString(commandString, state);
    } catch (e: unknown) {
      throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
    }
    speaker.setPlayState(state);
    let cancelled = false;
    const play = async (song: Song, depth = 0, done?: () => void) => {
      if (depth > 200) {
        throw RuntimeError.fromToken(this.token, OUT_OF_STACK_SPACE);
      }
      for (const note of song.notes) {
        if (cancelled) {
          return;
        }
        if (note.pointer) {
          const {address} = context.memory.readPointer(note.pointer);
          const xString = context.memory.readAddress(address);
          if (!xString) {
            continue;
          }
          if (!isString(xString)) {
            throw RuntimeError.fromToken(this.token, ILLEGAL_FUNCTION_CALL);
          }
          await play(parsePlayCommandString(xString.string, state), depth + 1);
        } else {
          await speaker.tone(note.pitch.frequency, note.onDuration, note.offDuration);
        }
      }
      done?.();
    };
    return {
      tag: ControlFlowTag.WAIT,
      promise: context.scheduler.schedule({
        start: (resolve) => {
          play(song, 0, resolve);
        },
        cancel: () => {
          cancelled = true;
        }
      })
    };
  }
}

interface Pitch {
  noteNumber: number;
  octave: number;
  noteName: string;
  frequency: number;
}

const PITCH: Pitch[] = [
  { noteNumber: 0, noteName: '', octave: 0, frequency: 0 },
  { noteNumber: 1, noteName: 'C', octave: 0, frequency: 65.406 },
  { noteNumber: 2, noteName: 'C#', octave: 0, frequency: 69.296 },
  { noteNumber: 3, noteName: 'D', octave: 0, frequency: 73.416 },
  { noteNumber: 4, noteName: 'D#', octave: 0, frequency: 77.796 },
  { noteNumber: 5, noteName: 'E', octave: 0, frequency: 82.406 },
  { noteNumber: 6, noteName: 'F', octave: 0, frequency: 87.308 },
  { noteNumber: 7, noteName: 'F#', octave: 0, frequency: 92.498 },
  { noteNumber: 8, noteName: 'G', octave: 0, frequency: 97.998 },
  { noteNumber: 9, noteName: 'G#', octave: 0, frequency: 103.826 },
  { noteNumber: 10, noteName: 'A', octave: 0, frequency: 110 },
  { noteNumber: 11, noteName: 'A#', octave: 0, frequency: 116.54 },
  { noteNumber: 12, noteName: 'B', octave: 0, frequency: 123.472 },
  { noteNumber: 13, noteName: 'C', octave: 1, frequency: 130.812 },
  { noteNumber: 14, noteName: 'C#', octave: 1, frequency: 138.592 },
  { noteNumber: 15, noteName: 'D', octave: 1, frequency: 146.832 },
  { noteNumber: 16, noteName: 'D#', octave: 1, frequency: 155.592 },
  { noteNumber: 17, noteName: 'E', octave: 1, frequency: 164.812 },
  { noteNumber: 18, noteName: 'F', octave: 1, frequency: 174.616 },
  { noteNumber: 19, noteName: 'F#', octave: 1, frequency: 184.996 },
  { noteNumber: 20, noteName: 'G', octave: 1, frequency: 195.996 },
  { noteNumber: 21, noteName: 'G#', octave: 1, frequency: 207.652 },
  { noteNumber: 22, noteName: 'A', octave: 1, frequency: 220 },
  { noteNumber: 23, noteName: 'A#', octave: 1, frequency: 233.08 },
  { noteNumber: 24, noteName: 'B', octave: 1, frequency: 246.944 },
  { noteNumber: 25, noteName: 'C', octave: 2, frequency: 261.624 },
  { noteNumber: 26, noteName: 'C#', octave: 2, frequency: 277.184 },
  { noteNumber: 27, noteName: 'D', octave: 2, frequency: 293.664 },
  { noteNumber: 28, noteName: 'D#', octave: 2, frequency: 311.184 },
  { noteNumber: 29, noteName: 'E', octave: 2, frequency: 329.624 },
  { noteNumber: 30, noteName: 'F', octave: 2, frequency: 349.232 },
  { noteNumber: 31, noteName: 'F#', octave: 2, frequency: 369.992 },
  { noteNumber: 32, noteName: 'G', octave: 2, frequency: 391.992 },
  { noteNumber: 33, noteName: 'G#', octave: 2, frequency: 415.304 },
  { noteNumber: 34, noteName: 'A', octave: 2, frequency: 440 },
  { noteNumber: 35, noteName: 'A#', octave: 2, frequency: 466.16 },
  { noteNumber: 36, noteName: 'B', octave: 2, frequency: 493.888 },
  { noteNumber: 37, noteName: 'C', octave: 3, frequency: 523.248 },
  { noteNumber: 38, noteName: 'C#', octave: 3, frequency: 554.368 },
  { noteNumber: 39, noteName: 'D', octave: 3, frequency: 587.328 },
  { noteNumber: 40, noteName: 'D#', octave: 3, frequency: 622.368 },
  { noteNumber: 41, noteName: 'E', octave: 3, frequency: 659.248 },
  { noteNumber: 42, noteName: 'F', octave: 3, frequency: 698.464 },
  { noteNumber: 43, noteName: 'F#', octave: 3, frequency: 739.984 },
  { noteNumber: 44, noteName: 'G', octave: 3, frequency: 783.984 },
  { noteNumber: 45, noteName: 'G#', octave: 3, frequency: 830.608 },
  { noteNumber: 46, noteName: 'A', octave: 3, frequency: 880 },
  { noteNumber: 47, noteName: 'A#', octave: 3, frequency: 932.32 },
  { noteNumber: 48, noteName: 'B', octave: 3, frequency: 987.776 },
  { noteNumber: 49, noteName: 'C', octave: 4, frequency: 1046.496 },
  { noteNumber: 50, noteName: 'C#', octave: 4, frequency: 1108.736 },
  { noteNumber: 51, noteName: 'D', octave: 4, frequency: 1174.656 },
  { noteNumber: 52, noteName: 'D#', octave: 4, frequency: 1244.736 },
  { noteNumber: 53, noteName: 'E', octave: 4, frequency: 1318.496 },
  { noteNumber: 54, noteName: 'F', octave: 4, frequency: 1396.928 },
  { noteNumber: 55, noteName: 'F#', octave: 4, frequency: 1479.968 },
  { noteNumber: 56, noteName: 'G', octave: 4, frequency: 1567.968 },
  { noteNumber: 57, noteName: 'G#', octave: 4, frequency: 1661.216 },
  { noteNumber: 58, noteName: 'A', octave: 4, frequency: 1760 },
  { noteNumber: 59, noteName: 'A#', octave: 4, frequency: 1864.64 },
  { noteNumber: 60, noteName: 'B', octave: 4, frequency: 1975.552 },
  { noteNumber: 61, noteName: 'C', octave: 5, frequency: 2092.992 },
  { noteNumber: 62, noteName: 'C#', octave: 5, frequency: 2217.472 },
  { noteNumber: 63, noteName: 'D', octave: 5, frequency: 2349.312 },
  { noteNumber: 64, noteName: 'D#', octave: 5, frequency: 2489.472 },
  { noteNumber: 65, noteName: 'E', octave: 5, frequency: 2636.992 },
  { noteNumber: 66, noteName: 'F', octave: 5, frequency: 2793.856 },
  { noteNumber: 67, noteName: 'F#', octave: 5, frequency: 2959.936 },
  { noteNumber: 68, noteName: 'G', octave: 5, frequency: 3135.936 },
  { noteNumber: 69, noteName: 'G#', octave: 5, frequency: 3322.432 },
  { noteNumber: 70, noteName: 'A', octave: 5, frequency: 3520 },
  { noteNumber: 71, noteName: 'A#', octave: 5, frequency: 3729.28 },
  { noteNumber: 72, noteName: 'B', octave: 5, frequency: 3951.104 },
  { noteNumber: 73, noteName: 'C', octave: 6, frequency: 4185.984 },
  { noteNumber: 74, noteName: 'C#', octave: 6, frequency: 4434.944 },
  { noteNumber: 75, noteName: 'D', octave: 6, frequency: 4698.624 },
  { noteNumber: 76, noteName: 'D#', octave: 6, frequency: 4978.944 },
  { noteNumber: 77, noteName: 'E', octave: 6, frequency: 5273.984 },
  { noteNumber: 78, noteName: 'F', octave: 6, frequency: 5587.712 },
  { noteNumber: 79, noteName: 'F#', octave: 6, frequency: 5919.872 },
  { noteNumber: 80, noteName: 'G', octave: 6, frequency: 6271.872 },
  { noteNumber: 81, noteName: 'G#', octave: 6, frequency: 6644.864 },
  { noteNumber: 82, noteName: 'A', octave: 6, frequency: 7040 },
  { noteNumber: 83, noteName: 'A#', octave: 6, frequency: 7458.56 },
  { noteNumber: 84, noteName: 'B', octave: 6, frequency: 7902.208 },
];

const CANONICAL_NOTE_NAME: Map<string, string> = new Map([
  ['a', 'a'], ['a#', 'a#'], ['a+', 'a#'], ['a-', 'g#'],
  ['b', 'b']                            , ['b-', 'a#'],
  ['c', 'c'], ['c#', 'c#'], ['c+', 'c#']              , 
  ['d', 'd'], ['d#', 'd#'], ['d+', 'd#'], ['d-', 'c#'],
  ['e', 'e']                            , ['e-', 'd#'],
  ['f', 'f'], ['f#', 'f#'], ['f+', 'f#']              ,
  ['g', 'g'], ['g#', 'g#'], ['g+', 'g#'], ['g-', 'f#'],
]);

function lookupPitchByNoteName(noteName: string, octave: number): Pitch {
  const canonicalName = CANONICAL_NOTE_NAME.get(noteName);
  for (const pitch of PITCH) {
    if (pitch.octave === octave && pitch.noteName.toLowerCase() === canonicalName) {
      return pitch;
    }
  }
  throw new Error(`invalid note ${noteName}`);
}

function lookupPitchByNoteNumber(number: number): Pitch {
  const pitch = PITCH[number];
  if (!pitch) {
    throw new Error(`invalid note number ${number}`);
  }
  return pitch;
}

interface Song {
  notes: Command[];
}

interface Command {
  pitch: Pitch;
  onDuration: number;
  offDuration: number;
  pointer?: number;
}

function parsePlayCommandString(commands: string, state: PlayState): Song {
  const pointers = commands.match(/x..../gsi);
  // It seems like commands can optionally end with a semicolon.
  // Multiple semicolons in a row don't parse, but we'll allow it.
  commands = commands.replace(/x..../gsi, 'x').replace(/[\s;]+/g, '').toLowerCase();
  const tokens = commands.match(/(o\d+|<|>|[a-g][-#+]?\d*|n\d+|m[lnsfb]|l\d+|p\d+|t\d+|\.|x|.)/g) || [];
  const song: Song = {notes: []};
  const quarterNotesToSeconds = (quarterNotes: number) => {
    // quarter notes / (quarter notes / second)
    return (4 / quarterNotes) / (state.tempo / 60);
  };
  const addNote = (pitch: Pitch, length: number) => {
    const duration = quarterNotesToSeconds(length);
    const onDuration = state.onFraction * duration;
    const offDuration = duration - onDuration;
    song.notes.push({pitch, onDuration, offDuration});
  };
  for (const command of tokens) {
    switch (command[0]) {
      case 'o': {
        const newOctave = parseInt(command.slice(1), 10);
        if (newOctave < 0 || newOctave > 6) {
          throw new Error('invalid octave');
        }
        state.octave = newOctave;
        break;
      }
      case '<':
        if (state.octave > 0) {
          state.octave--;
        }
        break;
      case '>':
        if (state.octave < 6) {
          state.octave++;
        }
        break;
      case 'a':
      case 'b':
      case 'c':
      case 'd':
      case 'e':
      case 'f':
      case 'g': {
        let noteName = command;
        let length = state.noteLength;
        const nameAndLength = command.match(/([a-g][-#+]?)(\d+)$/i);
        if (nameAndLength) {
          noteName = nameAndLength[1];
          length = parseInt(nameAndLength[2], 10);
        }
        const pitch = lookupPitchByNoteName(noteName, state.octave);
        addNote(pitch, length);
        break;
      }
      case 'n': {
        const noteNumber = parseInt(command.slice(1), 10);
        const pitch = lookupPitchByNoteNumber(noteNumber);
        addNote(pitch, state.noteLength);
        break;
      }
      case 'm': {
        switch (command[1]) {
          case 's':
            state.onFraction = 0.75;
            break;
          case 'n':
            state.onFraction = 0.875;
            break;
          case 'l':
            state.onFraction = 1.0;
            break;
          case 'f':
            state.playInBackground = false;
            break;
          case 'b':
            state.playInBackground = true;
            break;
          default:
            throw new Error(`unknown command ${command}`);
        }
        break;
      }
      case 'l': {
        const newLength = parseInt(command.slice(1), 10);
        if (newLength < 1 || newLength > 64) {
          throw new Error('invalid note length');
        }
        state.noteLength = newLength;
        break;
      }
      case 'p': {
        const pauseLength = parseInt(command.slice(1), 10);
        if (pauseLength === 0) {
          break;
        }
        if (pauseLength < 1 || pauseLength > 64) {
          throw new Error('invalid note length');
        }
        const pitch = PITCH[0];
        const duration = quarterNotesToSeconds(pauseLength);
        const onDuration = 0;
        const offDuration = duration;
        song.notes.push({pitch, onDuration, offDuration});
        break;
      }
      case 't': {
        const newTempo = parseInt(command.slice(1), 10);
        if (newTempo < 32) {
          throw new Error('invalid tempo');
        }
        state.tempo = newTempo > 255 ? 255 : newTempo;
        break;
      }
      case '.': {
        const lastNote = song.notes.at(-1);
        if (!lastNote) {
          throw new Error('no previous note')
        }
        lastNote.onDuration *= 1.5;
        lastNote.offDuration *= 1.5;
        break;
      }
      case 'x': {
        if (!pointers || !pointers.length) {
          throw new Error('missing pointer for x command');
        }
        const address = pointers.shift()?.slice(1, 5);
        if (!address) {
          throw new Error('bad pointer for x command');
        }
        const bytes = stringToAscii(address);
        song.notes.push({
          pitch: PITCH[0],
          onDuration: 0,
          offDuration: 0,
          pointer: bytes[0] + (bytes[1] << 8) + (bytes[2] << 16) + (bytes[3] << 24)
        });
        break;
      }
      default:
        throw new Error(`unrecognized command ${command}`);
    }
  }
  return song;
}