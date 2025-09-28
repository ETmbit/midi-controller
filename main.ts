////////////////////////////
//########################//
//##                    ##//
//##  midi-messages.ts  ##//
//##                    ##//
//########################//
////////////////////////////

// 0: stop playing
// 1: start playing
// 2: pause on
// 3: pause off
// 4: repeat on
// 5: repeat off

// 100-500: transposing = value - 300

// 1000-1199: instrument partiture 1
// 1200-1399: instrument partiture 2
// 1400-1599: instrument partiture 3
// 1600-1799: instrument partiture 4
// 1800-1999: instrument partiture 5

// 2000-2199: volume partiture 1
// 2200-2399: volume partiture 2
// 2400-2599: volume partiture 3
// 2600-2799: volume partiture 4
// 2800-2999: volume partiture 5

// > 3000: duration = value - 3000

enum MidiCommand {
    Stop = 0,
    Start = 1,
    PauseOn = 2,
    PauseOff = 3,
    RepeatOn = 4,
    RepeatOff = 5,
    Transpose = 100,
    Instrument1 = 1000,
    Instrument2 = 1200,
    Instrument3 = 1400,
    Instrument4 = 1600,
    Instrument5 = 1800,
    Volume1 = 2000,
    Volume2 = 2200,
    Volume3 = 2400,
    Volume4 = 2600,
    Volume5 = 2800,
    Duration = 3000
}

type MidiMessage = { Command: MidiCommand, Value: number }

function receiveMidi(radiocmd: number): MidiMessage {
    let msg: MidiMessage = { Command: 0, Value: 0 }
    if (radiocmd < 100) {
        msg.Command = radiocmd
        msg.Value = 0
    }
    else
        if (radiocmd < 1000) {
            msg.Command = MidiCommand.Transpose
            msg.Value = radiocmd - 100
        }
        else
            if (radiocmd < 3000) {
                msg.Command = Math.floor(radiocmd / 200) * 200
                msg.Value = radiocmd - msg.Command
            }
            else {
                msg.Command = MidiCommand.Duration
                msg.Value = radiocmd - 3000
            }
    return msg
}

function sendMidi(command: MidiCommand, value: number = 0) {
    if (command >= 100) command += value
    radio.sendNumber(command)
}


//////////////////////////////
//##########################//
//##                      ##//
//##  midi-controller.ts  ##//
//##                      ##//
//##########################//
//////////////////////////////

serial.redirect(SerialPin.P14, SerialPin.P13, 31250)

let TEMPO = 1.0     // normal tempo * 1
let TONE = 0        // midi notes up(+) or down(-)

let TUNENOTES: number[][]
let MEASURE: number
let CURMEASURE = 0

const TUNE_PART = 0
const TUNE_START = 1
const TUNE_DURA = 2
const NOTE_OFF = 0
const CHORD_ROOT = 3
const CHORD_MAX = 9
const PART_MAX = 5
const NOTE_PAUSE = 127

let MIDIRESTART = true
let MIDIREPEAT = false
let MIDIPLAY = false
let MIDINOTE = 0

let midinotes =
    [
        [0, 0, 0, 0, 0, 0, 0, 0, 0], // [0] time noteOff + [3..8] chord notes partiture 1
        [0, 0, 0, 0, 0, 0, 0, 0, 0], // [0] time noteOff + [3..8] chord notes partiture 2
        [0, 0, 0, 0, 0, 0, 0, 0, 0], // [0] time noteOff + [3..8] chord notes partiture 3
        [0, 0, 0, 0, 0, 0, 0, 0, 0], // [0] time noteOff + [3..8] chord notes partiture 4
        [0, 0, 0, 0, 0, 0, 0, 0, 0], // [0] time noteOff + [3..8] chord notes partiture 5
    ]

let partinstrument = [0, 0, 0, 0, 0]
let partvolume = [0, 0, 0, 0, 0]

function noteOn(note: number, volume: number) {
    let buffer = pins.createBuffer(3)
    buffer.setUint8(0, 0x90)
    buffer.setUint8(1, note & 0xFF)
    buffer.setUint8(2, volume & 0xFF)
    serial.writeBuffer(buffer)
}

function noteOff(note: number) {
    let buffer = pins.createBuffer(3)
    buffer.setUint8(0, 0x80)
    buffer.setUint8(1, note & 0xFF)
    buffer.setUint8(2, 0)
    serial.writeBuffer(buffer)
}

function percussionOn(instrument: number, volume: number) {
    let buffer = pins.createBuffer(3)
    buffer.setUint8(0, 0x99)
    buffer.setUint8(1, instrument & 0xFF)
    buffer.setUint8(2, volume & 0xFF)
    serial.writeBuffer(buffer)
}

function persussionOff(instrument: number) {
    let buffer = pins.createBuffer(3)
    buffer.setUint8(0, 0x89)
    buffer.setUint8(1, instrument & 0xFF)
    buffer.setUint8(2, 0)
    serial.writeBuffer(buffer)
}

function instrument(instr: number) {
    let buffer = pins.createBuffer(2)
    buffer.setUint8(0, 0xC0)
    buffer.setUint8(1, instr & 0xFF)
    serial.writeBuffer(buffer)
}

let part = -1
let tone = 0
let tm_start = control.millis()
let tm_pause = control.millis()
let tm = control.millis()

basic.forever(function () {

    if (!MIDIPLAY) return

    if (MIDIRESTART) {
        MIDIRESTART = false
        part = -1
        tone = 0
        tm_pause = 0
        tm_start = control.millis()
    }

    tm = control.millis();

    if (tm >= tm_start + TEMPO * TUNENOTES[MIDINOTE][TUNE_START]) {
        tone = TONE;
        part = TUNENOTES[MIDINOTE][TUNE_PART] - 1;
        for (let i = CHORD_ROOT; i < CHORD_MAX; i++) {
            if (midinotes[part][i] >= 0 && midinotes[part][i] < NOTE_PAUSE)
                noteOff(midinotes[part][i]);
            midinotes[part][i] = TUNENOTES[MIDINOTE][i];
        }
        midinotes[part][NOTE_OFF] = tm_start +
            TEMPO * (TUNENOTES[MIDINOTE][TUNE_START] + TUNENOTES[MIDINOTE][TUNE_DURA]);
        for (let i = CHORD_ROOT; i < CHORD_MAX; i++)
            if (midinotes[part][i] >= 0 && midinotes[part][i] < NOTE_PAUSE) {
                midinotes[part][i] = midinotes[part][i] + TONE;
                if (partinstrument[part] < 0)
                    percussionOn(-partinstrument[part], partvolume[part]);
                else
                    instrument(partinstrument[part]);
                noteOn(midinotes[part][i], partvolume[part]);
            }
        MIDINOTE += 1;

        if (TUNENOTES[MIDINOTE][TUNE_PART] < 0) {
            // let MIDINOTE notes finish
            let cnt = 0;
            while (MIDIPLAY && (cnt < 5)) {
                cnt = 0;
                for (part = 0; part < PART_MAX; part++) {
                    if (midinotes[part][NOTE_OFF]) {
                        if (midinotes[part][NOTE_OFF] < control.millis()) {
                            for (let i = CHORD_ROOT; i < CHORD_MAX; i++)
                                noteOff(midinotes[part][i]);
                            midinotes[part][NOTE_OFF] = 0;
                            cnt += 1;
                        }
                    }
                    else
                        cnt += 1;
                }
            }

            MIDIRESTART = true;
            MIDINOTE = 0
            if (MIDIREPEAT) {
                MidiController.stop()
                basic.pause(500)
                MidiController.start()
            }
            else
                MidiController.stop()
        }
    }

    let cur = Math.floor((tm - tm_start) / MEASURE) + 1
    if (CURMEASURE != cur) {
        CURMEASURE = cur
        radio.sendNumber(-CURMEASURE)
    }
})

enum Instrument {
    //% block="piano"
    //% block.loc.nl="piano"
    Piano = 0,
    //% block="synthesizer"
    //% block.loc.nl="synthesizer"
    Synthesizer = 50,
    //% block="organ"
    //% block.loc.nl="orgel"
    Organ = 19,
    //% block="guitar"
    //% block.loc.nl="gitaar"
    Guitar = 25,
    //% block="electric guitar"
    //% block.loc.nl="electrische gitaar"
    ElGuitar = 26,
    //% block="banjo"
    //% block.loc.nl="banjo"
    Banjo = 105,
    //% block="harp"
    //% block.loc.nl="harp"
    Harp = 46,
    //% block="violin"
    //% block.loc.nl="viool"
    Violin = 40,
    //% block="cello"
    //% block.loc.nl="cello"
    Cello = 42,
    //% block="oboe"
    //% block.loc.nl="hobo"
    Oboe = 68,
    //% block="clarinet"
    //% block.loc.nl="klarinet"
    Clarinet = 71,
    //% block="trumpet"
    //% block.loc.nl="trompet"
    Trumpet = 56,
    //% block="trombone"
    //% block.loc.nl="trombone"
    Trombone = 57,
    //% block="horn"
    //% block.loc.nl="hoorn"
    Horn = 60,
    //% block="sopran saxophone"
    //% block.loc.nl="sopraan saxofoon"
    SoprSax = 64,
    //% block="alto saxophone"
    //% block.loc.nl="alt saxofoon"
    AltSax = 65,
    //% block="tenor saxophone"
    //% block.loc.nl="tenor saxofoon"
    TenSax = 66,
    //% block="piccoo"
    //% block.loc.nl="piccolo"
    Piccolo = 72,
    //% block="flute"
    //% block.loc.nl="fluit"
    Flute = 73,
    //% block="panflute"
    //% block.loc.nl="panfluit"
    PanFlute = 75,
    //% block="wistle"
    //% block.loc.nl="mond fluiten"
    Whistle = 78,
    //% block="bag pipe"
    //% block.loc.nl="doedelzak"
    Bagpipe = 109,
    //% block="xylophone"
    //% block.loc.nl="xylofoon"
    Xylophone = 13,
    //% block="tubular bells"
    //% block.loc.nl="buis-klokkenspel"
    TubBells = 14,
    //% block="Chimes"
    //% block.loc.nl="Klokkenspel"
    Chimes = 9,
    //% block="marimba"
    //% block.loc.nl="marimba"
    Marimba = 12,
    //% block="steel drum"
    //% block.loc.nl="steeldrum"
    SteelDrum = 114,
    //% block="drum"
    //% block.loc.nl="kleine trom"
    Drum = -38,
    //% block="bass drum"
    //% block.loc.nl="grote trom"
    BassDrum = -36,
    //% block=""
    //% block.loc.nl=""
    HiTom = -50,
    //% block=""
    //% block.loc.nl=""
    LoTom = -45,
    //% block="cymbal"
    //% block.loc.nl="bekken"
    Cymbal = -49,
    //% block="tambourine"
    //% block.loc.nl="tamboerijn"
    Tambourine = -54,
    //% block="cowbell"
    //% block.loc.nl="koebel"
    CowBell = -56,
    //% block="hand clap"
    //% block.loc.nl="klap in de handen"
    HandClap = -39,
    //% block="high bongo"
    //% block.loc.nl="hoge bongo"
    HiBongo = -60,
    //% block="low bongo"
    //% block.loc.nl="lage bongo"
    LoBongo = -61,
    //% block="triangle"
    //% block.loc.nl="triangel"
    Triangle = -81,
}

function showPlaying() {
    basic.showLeds(`
                        . # # . .
                        . # # # .
                        . # # # #
                        . # # # .
                        . # # . .
                        `)
}

function showPaused() {
    basic.showLeds(`
                        # # . # #
                        # # . # #
                        # # . # #
                        # # . # #
                        # # . # #
                        `)
}

function showStopped() {
    basic.showLeds(`
                        . . . . .
                        . # # # .
                        . # # # .
                        . # # # .
                        . . . . .
                        `)
}

//% color="#47D45A" icon="\uf001"
//% block="Midi tune"
//% block.loc.nl="Midi tune"
namespace MidiController {

    //% block="current measure"
    //% block.loc.nl="huidige maat"
    export function currentMeasure(): number {
        return CURMEASURE
    }

    //% block="start"
    //% block.loc.nl="start"
    export function start() {
        showPlaying()
        tm_pause = 0
        MIDINOTE = 0
        MIDIPLAY = true
        MIDIRESTART = true
        CURMEASURE = -1
    }

    //% block="set pause %status"
    //% block.loc.nl="zet pauze %status"
    export function pause(status: boolean) {
        if ((tm_pause != 0) != status) {
            if (tm_pause) {
                showPlaying()
                tm_start += control.millis() - tm_pause
                tm_pause = 0;
                MIDIPLAY = true
            }
            else {
                if (MIDIPLAY) {
                    tm_pause = control.millis()
                    MIDIPLAY = false
                    showPaused()
                }
            }
        }
    }

    //% block="set repeat %status"
    //% block.loc.nl="zet repeat %status"
    export function repeat(status: boolean) {
        MIDIREPEAT = status
    }

    //% block="stop the tune"
    //% block.loc.nl="stop de tune"
    export function stop() {
        tm_pause = 0
        MIDIPLAY = false
        showStopped()
    }

    //% block="choose %instrument or pariture %partiture"
    //% block.loc.nl="Kies %instrument voor partituur %partiture"
    //% partiture.min=1 partiture.max=5
    export function setInstrument(instrument: Instrument, partiture: number) {
        if (partiture < 1 || partiture > 5) return;
        if (instrument < -127 || instrument > 127) return
        partinstrument[partiture - 1] = instrument;
    }

    //% block="set volume of pariture %partiture to %volume %%"
    //% block.loc.nl="Stel het volume van partituur %partiture in op %volume %%"
    //% partiture.min=1 partiture.max=5
    //% volume.min=0 volume.max=100
    export function setVolume(partiture: number, volume: number) {
        if (partiture < 1 || partiture > 5) return;
        if (volume > 127) return
        partvolume[partiture - 1] = volume;
    }

    //% block="change tempo to %perc %%"
    //% block.loc.nl="wijzig het tempo in %perc %%"
    //% perc.min=0 perc.max=100
    export function setTempo(perc: number) {
        if (perc > 200) return
        perc = 200 - perc
        TEMPO = perc / 100
    }

    //% block="transpose the tune with %distance note distance"
    //% block.loc.nl="transponeer the tune met %distance" noot-afstand"
    //% distance.min=-127 distance.max=127
    export function setTranspose(distance: number) {
        TONE = Math.floor(distance);
    }
} // end namespace

MidiController.setInstrument(1, 0)
MidiController.setInstrument(2, 0)
MidiController.setInstrument(3, 0)
MidiController.setInstrument(4, 0)
MidiController.setInstrument(5, 0)

MidiController.setVolume(1, 64)
MidiController.setVolume(2, 64)
MidiController.setVolume(3, 64)
MidiController.setVolume(4, 64)
MidiController.setVolume(5, 64)

messageHandler = (cmd: number) => {
    let msg: MidiMessage = receiveMidi(cmd)
    switch (msg.Command) {
        case MidiCommand.Stop: MidiController.stop(); break;
        case MidiCommand.Start: MidiController.start(); break;
        case MidiCommand.PauseOn: MidiController.pause(true); break;
        case MidiCommand.PauseOff: MidiController.pause(false); break;
        case MidiCommand.RepeatOn: MidiController.repeat(true); break;
        case MidiCommand.RepeatOff: MidiController.repeat(false); break;
        case MidiCommand.Transpose: MidiController.setTranspose(msg.Value); break;
        case MidiCommand.Instrument1: MidiController.setInstrument(1, msg.Value); break;
        case MidiCommand.Instrument2: MidiController.setInstrument(2, msg.Value); break;
        case MidiCommand.Instrument3: MidiController.setInstrument(3, msg.Value); break;
        case MidiCommand.Instrument4: MidiController.setInstrument(4, msg.Value); break;
        case MidiCommand.Instrument5: MidiController.setInstrument(5, msg.Value); break;
        case MidiCommand.Volume1: MidiController.setVolume(1, msg.Value); break;
        case MidiCommand.Volume2: MidiController.setVolume(2, msg.Value); break;
        case MidiCommand.Volume3: MidiController.setVolume(3, msg.Value); break;
        case MidiCommand.Volume4: MidiController.setVolume(4, msg.Value); break;
        case MidiCommand.Volume5: MidiController.setVolume(5, msg.Value); break;
        case MidiCommand.Duration: MidiController.setTempo(msg.Value); break;
    }
}

displayHandler = () => {
    if (tm_pause)
        showPaused()
    else
        if (MIDIPLAY)
            showPlaying()
        else
            showStopped()
}
