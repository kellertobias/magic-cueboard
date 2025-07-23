import { EventEmitter } from "node:events";
import { JSDOM } from "jsdom";
import { parameterGroups } from "@/parameter-groups";

/**
 * Represents a single fixture/head in the programmer
 */
export interface ProgrammerHead {
  head: {
    name: string;
    type: string;
    no: string;
  };
  parameters: Record<string, Record<string, string>>;
}

/**
 * Complete programmer data structure
 */
export interface ProgrammerData {
  heads: ProgrammerHead[];
  timestamp: number;
}

/**
 * Service for monitoring MagicQ's programmer window
 * Fetches /prog.html on-demand when requested by clients
 * Throttled to maximum 2 requests per second across all clients
 */
export class MagicQProgrammerService extends EventEmitter {
  // Throttling mechanism - max 2 requests per second
  private lastFetchTime: number = 0;
  private readonly THROTTLE_INTERVAL = 500; // 500ms = 2 requests per second
  private pendingFetch: NodeJS.Timeout | null = null;

  /**
   * Parameter grouping mapping - defines how individual parameters are grouped together
   */

  constructor(private baseUrl = "http://localhost:8080") {
    super();
  }

  /**
   * Requests programmer data with throttling
   * Multiple calls within the throttle window will be batched
   */
  public requestUpdate(): void {
    const now = Date.now();
    const timeSinceLastFetch = now - this.lastFetchTime;

    if (timeSinceLastFetch >= this.THROTTLE_INTERVAL) {
      // Can fetch immediately
      this.performFetch();
    } else {
      // Need to throttle - schedule fetch for later if not already scheduled
      if (!this.pendingFetch) {
        const delay = this.THROTTLE_INTERVAL - timeSinceLastFetch;
        console.log(
          `[MagicQ Programmer] Throttling fetch, delaying ${delay}ms`
        );

        this.pendingFetch = setTimeout(() => {
          this.pendingFetch = null;
          this.performFetch();
        }, delay);
      }
    }
  }

  /**
   * Performs the actual data fetch and processing
   */
  private async performFetch(): Promise<void> {
    try {
      this.lastFetchTime = Date.now();
      console.log("[MagicQ Programmer] Fetching programmer data on demand");

      const data = await this.fetchProgrammerData();
      if (!data) return;

      this.emit("programmerUpdate", data);
    } catch (error) {
      console.error(
        "[MagicQ Programmer] Error fetching programmer data:",
        error
      );
      this.emit("error", error);
    }
  }

  /**
   * Starts the service (no longer polls continuously)
   */
  public start(): void {
    console.log("[MagicQ Programmer] Service started (on-demand mode)");
  }

  /**
   * Stops the service and clears any pending fetches
   */
  public async stop(): Promise<void> {
    if (this.pendingFetch) {
      clearTimeout(this.pendingFetch);
      this.pendingFetch = null;
    }
    console.log("[MagicQ Programmer] Service stopped");
  }

  /**
   * Fetches and parses the programmer data from MagicQ
   */
  private async fetchProgrammerData(): Promise<ProgrammerData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/prog.html`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);

      // Find the second table (PROG WINDOW table)
      const tables = Array.from(dom.window.document.querySelectorAll("table"));
      let progTable: Element | null = null;

      for (const table of tables) {
        const caption = table.querySelector("caption");
        if (caption?.textContent?.includes("PROG WINDOW")) {
          progTable = table;
          break;
        }
      }

      if (!progTable) {
        console.log("[MagicQ Programmer] PROG WINDOW table not found");
        return null;
      }

      return this.parseProgTable(progTable);
    } catch (error) {
      console.error(
        "[MagicQ Programmer] Error fetching programmer data:",
        error
      );
      return null;
    }
  }

  /**
   * Parses the PROG WINDOW table and extracts fixture data
   */
  private parseProgTable(table: Element): ProgrammerData {
    const rows = table.querySelectorAll("tbody tr");
    const heads: ProgrammerHead[] = [];

    if (rows.length === 0) {
      return { heads, timestamp: Date.now() };
    }

    // Get headers from first row
    const headerRow = rows[0];
    const headers = Array.from(headerRow.querySelectorAll("th")).map(
      (th) => th.textContent?.trim() || ""
    );

    // Process data rows (skip header row)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = Array.from(row.querySelectorAll("td")).map(
        (td) => td.textContent?.trim() || ""
      );

      if (cells.length < 3) continue; // Need at least head name, type, and no

      // Extract head information (first 3 columns)
      const head = {
        name: cells[0] || "",
        type: cells[1] || "",
        no: cells[2] || "",
      };

      // Extract all parameters (excluding empty values)
      const groupedParameters: Record<string, Record<string, string>> = {};

      for (let j = 3; j < Math.min(cells.length, headers.length); j++) {
        const paramName = headers[j];
        const paramValue = cells[j];

        if (paramValue && paramValue.length > 0 && paramName) {
          // Group the parameter
          const groupName =
            parameterGroups[paramName as keyof typeof parameterGroups] ||
            "Other";
          if (!groupedParameters[groupName]) {
            groupedParameters[groupName] = {};
          }
          groupedParameters[groupName][paramName] = paramValue;
        }
      }

      // Only add heads that have some parameter values
      if (Object.keys(groupedParameters).length > 0) {
        heads.push({
          head,
          parameters: groupedParameters,
        });
      }
    }

    return {
      heads,
      timestamp: Date.now(),
    };
  }
}
