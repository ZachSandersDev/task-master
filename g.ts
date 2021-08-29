import { Command } from "https://deno.land/x/cliffy@v0.19.5/command/mod.ts";
import {
  Select,
  Confirm,
  Input,
  prompt,
} from "https://deno.land/x/cliffy@v0.19.5/prompt/mod.ts";

/**
 *
 *    Constants
 *
 */

const USERNAME = "zsanders";

const JIRA_URL = (ticketNumber: string) =>
  `https://compass-tech.atlassian.net/browse/LISTINGAPP-${ticketNumber}`;

const JIRA_TITLE = (prType: string, ticketNumber: string) =>
  `${prType}: [LISTING-${ticketNumber}]`;

/**
 *
 *    Helper Functions
 *
 */

async function execAndGetStr(cmd: string[]) {
  const p = Deno.run({ cmd, stdout: "piped" });
  const rawOut = await p.output();
  return new TextDecoder().decode(rawOut);
}

async function exec(cmd: string[]) {
  await Deno.run({ cmd }).status();
}

async function getBranches({
  includeCurrentInList,
}: { includeCurrentInList?: boolean } = {}): Promise<{
  current: string;
  branches: string[];
}> {
  const branchStr = await execAndGetStr(["git", "branch"]);

  const branches = branchStr
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b);

  const currentIndex = branches.findIndex((b) => b.startsWith("*"));
  if (currentIndex == -1) throw "Could not find current branch";

  const current = branches[currentIndex].replace("*", "").trim();

  if (!includeCurrentInList) {
    branches.splice(currentIndex, 1);
  } else {
    branches.splice(currentIndex, 1, current);
  }

  return { current, branches };
}

async function selectBranch(
  action: string,
  { includeCurrent }: { includeCurrent?: boolean } = {}
) {
  const { current, branches } = await getBranches({
    includeCurrentInList: includeCurrent,
  });

  if (!branches.length) {
    console.log(`No branches available to ${action}`);
    return;
  }

  console.log(`Current branch: "${current}"`);
  const selectedBranch = await Select.prompt({
    options: branches.map((b) => ({ title: b, value: b })),
    message: `Select a branch to ${action}:`,
  });

  return selectedBranch;
}

async function quickStash() {
  const statusStr = await execAndGetStr(["git", "status"]);
  if (
    !statusStr.includes("Changes not staged for commit:") ||
    !statusStr.includes("Untracked files:")
  ) {
    return;
  }

  const shouldStash = await Confirm.prompt({
    message: "Would you like to stash current changes?",
  });

  if (!shouldStash) return;

  await exec([
    "git",
    "stash",
    "push",
    "-u",
    "-m",
    `quickstash: ${new Date().toLocaleString()}`,
  ]);
}

async function applyQuickStash(branch: string) {
  const stashStr = await execAndGetStr(["git", "stash", "list"]);
  const stashes = stashStr.split("\n");

  const lastQuickStash = stashes.find(
    (s) =>
      s.includes("quickstash:") && s.includes(branch.split("/").pop() || "")
  );
  if (!lastQuickStash) return;

  const shouldStash = await Confirm.prompt({
    message: `Would you like apply the last quickstash "${lastQuickStash}"?`,
  });

  if (!shouldStash) return;

  await exec(["git", "stash", "apply", lastQuickStash.split(":")[0]]);
}

//------------------------------------------------------------//

const program = new Command();
program.name("Quick Git").version("1.0.0");

/**
 *
 *    Switch
 *
 */
program
  .command("s")
  .description("Switches branches")
  .action(async () => {
    const selectedBranch = await selectBranch("switch to");

    if (!selectedBranch) {
      console.log("Canceled");
      return;
    }

    await quickStash();
    await exec(["git", "switch", selectedBranch]);
    await applyQuickStash(selectedBranch);
  });

/**
 *
 *    Rebase
 *
 */
program
  .command("r")
  .description("Rebases the current branch")
  .action(async () => {
    const selectedBranch = await selectBranch("rebase on");

    if (!selectedBranch) {
      console.log("Canceled");
      return;
    }

    const useRemote = await Confirm.prompt({
      message: "Base on remote of this branch?",
    });
    if (useRemote === undefined) return;

    if (useRemote) {
      await exec(["git", "fetch"]);
      await exec(["git", "rebase", `origin/${selectedBranch}`]);
      return;
    }

    await exec(["git", "rebase", selectedBranch]);
  });

/**
 *
 *    Open Repo
 *
 */
program
  .command("o")
  .description("Attempts to open the remote repo in a browser")
  .action(async () => {
    const url = await execAndGetStr([
      "git",
      "config",
      "--get",
      "remote.origin.url",
    ]);
    if (url && url.startsWith("http")) {
      await exec(["open", url.replace(".git", "")]);
    }
  });

/**
 *
 *    New Branch
 *
 */
program
  .command("nb")
  .description("Creates a new branch")
  .action(async () => {
    const branchToBaseOn = await selectBranch("base new branch on", {
      includeCurrent: true,
    });
    if (!branchToBaseOn) return;

    const { useRemote, useTicket, ticketNumber, message } = await prompt([
      { type: Confirm, name: "useRemote", message: "Run pull first?" },
      {
        type: Confirm,
        name: "useTicket",
        default: true,
        message: "Make branch from Jira Ticket?",
        after: ({ useTicket }, next) => next(useTicket ? undefined : "message"),
      },
      {
        type: Input,
        name: "ticketNumber",
        message: "Enter the ticket number:",
      },
      {
        type: Input,
        name: "message",
        message: "Enter the branch description:",
      },
    ]);

    let branchName = `${USERNAME}/${message}`;
    if (useTicket) {
      branchName = `${USERNAME}/${ticketNumber}/${message}`;
    }

    await quickStash();
    await exec(["git", "switch", branchToBaseOn]);
    if (useRemote) {
      await exec(["git", "pull", "--ff"]);
    }
    await exec(["git", "checkout", "-b", branchName]);
    await exec(["git", "push", "--set-upstream", "origin", branchName]);
  });

/**
 *
 *    Delete Branch
 *
 */
program
  .command("db")
  .description("Deletes a branch")
  .action(async () => {
    const selectedBranch = await selectBranch("delete");
    if (!selectedBranch) return;
    if (selectedBranch == "main" || selectedBranch == "master")
      throw "Cannot delete main branches";

    const really = await Confirm.prompt({
      default: false,
      message: `Are you sure you want to delete branch "${selectedBranch}"?`,
    });

    if (!really) return;
    await exec(["git", "branch", "-D", selectedBranch]);
  });

/**
 *
 *    Open PR
 *
 */
program
  .command("opr")
  .description("Attempts to open the current pull request in a browser")
  .action(async () => {
    const { current } = await getBranches();
    await exec(["gh", "pr", "view", "--web", current]);
  });

/**
 *
 *    New PR
 *
 */
program
  .command("npr")
  .description("Creates a new pull request")
  .action(async () => {
    const { useTicket, prType, ticketNumber, message, body, isDraft } =
      await prompt([
        {
          type: Confirm,
          name: "useTicket",
          message: "Make PR from Jira Ticket?",
          after: ({ useTicket }, next) =>
            next(useTicket ? undefined : "message"),
        },
        {
          type: Select,
          name: "prType",
          options: [
            { name: "Feature", value: "Feat" },
            { name: "Minor", value: "Minor" },
            { name: "Update", value: "Update" },
            { name: "Patch", value: "Patch" },
            { name: "Chore", value: "Chore" },
            { name: "Fix", value: "Fix" },
          ],
          message: "Choose a PR type",
        },
        {
          type: Input,
          name: "ticketNumber",
          message: "Enter the ticket number:",
        },
        { type: Input, name: "message", message: "Enter the PR message:" },
        {
          type: Input,
          name: "body",
          message: "Enter body text:",
        },
        {
          type: Confirm,
          name: "isDraft",
          default: false,
          message: "Open PR as draft?",
        },
      ]);
    if (useTicket === undefined) return;
    if (useTicket && (!ticketNumber || !prType)) return;
    if (!message) return;

    if (useTicket) {
      await exec([
        "gh",
        "pr",
        "create",
        "--title",
        JIRA_TITLE(prType, ticketNumber) + " " + message,
        "--body",
        [JIRA_URL(ticketNumber), body, "[QA:none]"].join("\n\n"),
        isDraft ? "-d" : "",
      ]);
    } else {
      await exec([
        "gh",
        "pr",
        "create",
        "-f",
        "--title",
        message,
        "--body",
        body,
        isDraft ? "-d" : "",
      ]);
    }
    await exec(["gh", "pr", "view", "--web"]);
  });

// Main func
(async () => {
  try {
    if (!Deno.args?.length) {
      await program.parse(["--help"]);
    } else {
      await program.parse(Deno.args);
    }
  } catch (err) {
    console.error("Error:", err);
  }
})();
