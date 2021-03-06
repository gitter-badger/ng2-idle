import {Injectable, EventEmitter, OnDestroy} from 'angular2/core';

import {InterruptSource} from './interruptsource';
import {InterruptArgs} from './interruptargs';
import {Interrupt} from './interrupt';

/*
 * Indicates the desired auto resume behavior.
 */
export enum AutoResume {
  /*
   * Auto resume functionality will be disabled.
   */
  disabled,
  /*
   * Can resume automatically even if they are idle.
   */
  idle,
  /*
   * Can only resume automatically if they are not yet idle.
   */
  notIdle
}

/**
 * A service for detecting and responding to user idleness.
 */
@Injectable()
export class Idle implements OnDestroy {
  private idle: number = 20 * 60;   // in seconds
  private timeoutVal: number = 30;  // in seconds
  private autoResume: AutoResume = AutoResume.idle;
  private interrupts: Array<Interrupt> = new Array;
  private running: boolean = false;
  private idling: boolean = false;
  private idleHandle: any;
  private timeoutHandle: any;
  private countdown: number;

  public onIdleStart: EventEmitter<any> = new EventEmitter;
  public onIdleEnd: EventEmitter<any> = new EventEmitter;
  public onTimeoutWarning: EventEmitter<number> = new EventEmitter;
  public onTimeout: EventEmitter<number> = new EventEmitter;
  public onInterrupt: EventEmitter<any> = new EventEmitter;

  /*
   * Returns the current timeout value.
   * @return The timeout value in seconds.
   */
  getTimeout(): number { return this.timeoutVal; }

  /*
   * Sets the timeout value.
   * @param seconds - The timeout value in seconds. 0 or false to disable timeout feature.
   * @return The current value. If disabled, the value will be 0.
   */
  setTimeout(seconds: number | boolean): number {
    if (seconds === false) {
      this.timeoutVal = 0;
    } else if (typeof seconds === 'number' && seconds >= 0) {
      this.timeoutVal = seconds;
    } else {
      throw new Error('\'seconds\' can only be \'false\' or a positive number.');
    }

    return this.timeoutVal;
  }

  /*
   * Returns the current idle value.
   * @return The idle value in seconds.
   */
  getIdle(): number { return this.idle; }

  /*
   * Sets the idle value.
   * @param seconds - The idle value in seconds.
   * @return The idle value in seconds.
   */
  setIdle(seconds: number): number {
    if (seconds <= 0) {
      throw new Error('\'seconds\' must be greater zero');
    }

    return this.idle = seconds;
  }

  /*
   * Returns the current autoresume value.
   * @return The current value.
   */
  getAutoResume(): AutoResume { return this.autoResume; }

  setAutoResume(value: AutoResume): AutoResume { return this.autoResume = value; }

  /*
   * Sets interrupts from the specified sources.
   * @param sources - Interrupt sources.
   * @return The resulting interrupts.
   */
  setInterrupts(sources: Array<InterruptSource>): Array<Interrupt> {
    this.clearInterrupts();

    let self = this;

    for (let source of sources) {
      let sub = new Interrupt(source);
      sub.subscribe((args: InterruptArgs) => { self.interrupt(args.force, args.innerArgs); });
      sub.resume();

      this.interrupts.push(sub);
    }

    return this.interrupts;
  }

  /*
   * Returns the current interrupts.
   * @return The current interrupts.
   */
  getInterrupts(): Array<Interrupt> { return this.interrupts; }

  /*
   * Pauses, unsubscribes, and clears the current interrupt subscriptions.
   */
  clearInterrupts(): void {
    for (let sub of this.interrupts) {
      sub.pause();
      sub.unsubscribe();
    }

    this.interrupts.length = 0;
  }

  /*
   * Returns whether or not the service is running i.e. watching for idleness.
   * @return True if service is watching; otherwise, false.
   */
  isRunning(): boolean { return this.running; }

  /*
   * Returns whether or not the user is considered idle.
   * @return True if the user is in the idle state; otherwise, false.
   */
  isIdling(): boolean { return this.idling; }

  /*
   * Starts watching for inactivity.
   */
  watch(): void {
    this.safeClearInterval('idleHandle');
    this.safeClearInterval('timeoutHandle');

    if (this.idling) {
      this.toggleState();
    }

    this.running = true;

    this.idleHandle = setInterval(() => { this.toggleState(); }, this.idle * 1000);
  }

  /*
   * Stops watching for inactivity.
   */
  stop(): void {
    this.safeClearInterval('idleHandle');
    this.safeClearInterval('timeoutHandle');

    this.idling = false;
    this.running = false;
  }

  /*
   * Forces a timeout event and state.
   */
  timeout(): void {
    this.safeClearInterval('idleHandle');
    this.safeClearInterval('timeoutHandle');

    this.idling = true;
    this.running = false;
    this.countdown = 0;

    this.onTimeout.emit(null);
  }

  /*
   * Signals that user activity has occurred.
   * @param force - Forces watch to be called, unless they are timed out.
   * @param eventArgs - Optional source event arguments.
   */
  interrupt(force?: boolean, eventArgs?: any): void {
    if (!this.running) {
      return;
    }

    // TODO: expiry checking
    this.onInterrupt.emit(eventArgs);

    if (force === true || this.autoResume === AutoResume.idle ||
        (this.autoResume === AutoResume.notIdle && !this.idling)) {
      this.watch();
    }
  }

  private toggleState(): void {
    this.idling = !this.idling;

    if (this.idling) {
      this.onIdleStart.emit(null);

      if (this.timeoutVal > 0) {
        this.countdown = this.timeoutVal;
        this.doCountdown();
        this.timeoutHandle = setInterval(() => { this.doCountdown(); }, 1000);
      }
    } else {
      this.onIdleEnd.emit(null);
    }

    this.safeClearInterval('idleHandle');
  }

  private doCountdown(): void {
    if (!this.idling) {
      return;
    }

    if (this.countdown <= 0) {
      this.timeout();
      return;
    }

    this.onTimeoutWarning.emit(this.countdown);
    this.countdown--;
  }

  private safeClearInterval(handleName: string): void {
    if (this[handleName]) {
      clearInterval(this[handleName]);
      this[handleName] = null;
    }
  }

  /*
   * Called by Angular when destroying the instance.
   */
  ngOnDestroy(): void {
    this.stop();
    this.clearInterrupts();
  }
}
