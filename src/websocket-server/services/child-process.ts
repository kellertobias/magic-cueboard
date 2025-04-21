import { spawn, type ChildProcess as CP } from "node:child_process";
import { EventEmitter } from "node:events";

export class ChildProcess extends EventEmitter {
  private process: CP | null = null;
  private buffer = "";
  private command = "";
  private args: string[] = [];

  // Restart tracking
  private restartAttempts: number[] = [];
  private readonly maxRestarts = 5;
  private readonly restartWindow = 60 * 1000; // 1 minute in ms
  private readonly backoffTime = 5 * 60 * 1000; // 5 minutes in ms
  private backoffTimeout: NodeJS.Timeout | null = null;
  private restartTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  start(command: string, args: string[] = []): void {
    this.command = command;
    this.args = args;
    this.startProcess();
  }

  private startProcess(): void {
    if (this.isShuttingDown) return;

    // Check if we're in backoff period
    if (this.backoffTimeout) {
      return;
    }

    // Clean up old restart attempts outside the window
    const now = Date.now();
    this.restartAttempts = this.restartAttempts.filter(
      (time) => now - time < this.restartWindow
    );

    // Check if we've hit the restart limit
    if (this.restartAttempts.length >= this.maxRestarts) {
      console.warn("Too many restart attempts, backing off for 5 minutes");
      this.backoffTimeout = setTimeout(() => {
        this.backoffTimeout = null;
        this.restartAttempts = [];
        if (!this.isShuttingDown) {
          this.startProcess();
        }
      }, this.backoffTime);
      return;
    }

    // Start the process
    try {
      this.process = spawn(this.command, this.args);

      // Track restart attempt
      this.restartAttempts.push(now);

      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        console.log("child process stderr", data.toString());
      });

      this.process.on("error", (error: Error) => {
        if (!this.isShuttingDown) {
          this.handleProcessExit();
        }
      });

      this.process.on("exit", (code: number | null) => {
        console.warn(`Child process exited with code ${code}`);
        if (!this.isShuttingDown) {
          this.handleProcessExit();
        }
      });
    } catch (error) {
      console.error("Failed to start child process:", error);
      if (!this.isShuttingDown) {
        this.handleProcessExit();
      }
    }
  }

  private handleProcessExit(): void {
    this.process = null;
    // Attempt restart with a small delay to prevent rapid cycling
    this.restartTimeout = setTimeout(() => this.startProcess(), 10000);
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || "";

    // Process complete lines
    for (const line of lines) {
      if (line.trim()) {
        try {
          const jsonData = JSON.parse(line);
          this.emit("data", jsonData);
        } catch (error) {
          console.error("Invalid JSON:", error, line);
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    // Clear all timeouts
    if (this.backoffTimeout) {
      clearTimeout(this.backoffTimeout);
      this.backoffTimeout = null;
    }
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    // Kill the process if it exists
    if (this.process) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          this.process = null;
          this.restartAttempts = [];
          this.buffer = "";
          resolve();
        };

        try {
          // Try SIGTERM first
          this.process?.once("exit", cleanup);
          this.process?.kill("SIGTERM");

          // Force kill after 2 seconds if still running
          setTimeout(() => {
            if (this.process) {
              console.warn(
                "Process did not exit gracefully, forcing termination"
              );
              this.process.kill("SIGKILL");
              cleanup();
            }
          }, 2000);
        } catch (error) {
          console.error("Error killing process:", error);
          cleanup();
        }
      });
    }

    return Promise.resolve();
  }
}
