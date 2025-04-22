import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

export interface CommandOutput {
  line: string;
  isError: boolean;
}

/**
 * Service for executing shell commands and streaming their output
 */
export class CommandExecutorService extends EventEmitter {
  /**
   * Execute a shell command and emit its output line by line
   */
  public async callCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, [], {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Handle stdout
      process.stdout.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            this.emit("output", {
              line,
              isError: false,
            });
          }
        }
      });

      // Handle stderr
      process.stderr.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            this.emit("output", {
              line,
              isError: true,
            });
          }
        }
      });

      // Handle process completion
      process.on("close", (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          this.emit("output", {
            line: `Command failed with exit code ${code}`,
            isError: true,
          });
          console.error("Command error:", `Command failed with code ${code}`);
          resolve();
        }
      });

      // Handle process errors
      process.on("error", (err: Error) => {
        this.emit("output", {
          line: `Error: ${err.message}`,
          isError: true,
        });
        console.error("Command error:", String(err));
        resolve();
      });
    });
  }
}
