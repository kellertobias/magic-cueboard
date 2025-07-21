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
 * Fetches /prog.html every 0.5 seconds and emits events when data changes
 */
export class MagicQProgrammerService extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private lastDataHash: string | null = null;
  private isPolling = false;

  private lastData: ProgrammerData | null = null;

  /**
   * Parameter grouping mapping - defines how individual parameters are grouped together
   */

  constructor(private baseUrl = "http://localhost:8080") {
    super();
  }

  /**
   * Starts polling the programmer data every 500ms
   */
  public start(): void {
    if (this.isPolling) {
      console.log(
        "[MagicQ Programmer] Already polling, ignoring start request"
      );
      return;
    }

    console.log("[MagicQ Programmer] Starting programmer data polling");
    this.isPolling = true;

    // Fetch immediately, then start interval
    this.fetchAndCheckChanges();

    this.pollInterval = setInterval(() => {
      this.fetchAndCheckChanges();
    }, 500);
  }

  /**
   * Stops polling the programmer data
   */
  public async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
    this.lastDataHash = null;
    console.log("[MagicQ Programmer] Stopped programmer data polling");
  }

  /**
   * Fetches programmer data and checks if it has changed
   */
  private async fetchAndCheckChanges(): Promise<void> {
    try {
      const data = await this.fetchProgrammerData();
      if (!data) return;

      // Create a hash of the data to detect changes
      const dataHash = JSON.stringify(data);

      if (this.lastDataHash !== dataHash) {
        console.log("[MagicQ Programmer] Data changed, emitting update");
        this.lastDataHash = dataHash;
        this.lastData = data;
        // Emit the programmer data change event
        this.emit("programmerUpdate", data);
      }
    } catch (error) {
      console.error(
        "[MagicQ Programmer] Error fetching programmer data:",
        error
      );
      this.emit("error", error);
    }
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

  /**
   * Gets the current state of the programmer data (for immediate access)
   */
  public getCurrentState(): ProgrammerData | null {
    return this.lastData;
  }
}
