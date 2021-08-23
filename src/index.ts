#!/usr/bin/env node

import os from "os";
import path from "path";
import { promisify } from "util";
import { ChildProcess, exec, spawn } from "child_process";

import fs from "fs-extra";
import prompts from "prompts";

import ora from "ora";

//
// Helper Functions
//

const execP = promisify(exec);

async function getTaskMasterPath({ ensure }: { ensure?: boolean } = {}) {
  const taskMasterPath = path.join(os.homedir(), ".tm");

  if (ensure) {
    await fs.ensureDir(taskMasterPath);
  }

  return taskMasterPath;
}

async function getTaskPath(
  taskName: string,
  {
    file,
    ensure,
    checkExists,
  }: { file?: boolean; ensure?: boolean; checkExists?: boolean } = {}
) {
  const scriptsPath = path.join(await getTaskMasterPath(), "scripts");
  const taskPath = path.join(scriptsPath, file ? `${taskName}.ts` : taskName);

  if (ensure && !file) {
    await fs.ensureDir(taskPath);
  } else if (ensure) {
    await fs.ensureFile(taskPath);
  }

  if (checkExists && !(await fs.pathExists(taskPath))) {
    throw `task "${taskName}" does not exist`;
  }

  return taskPath;
}

async function resolveTaskPath(taskName: string) {
  const scriptsPath = path.join(await getTaskMasterPath(), "scripts");
  const taskFolderPath = path.join(scriptsPath, taskName);
  const taskFilePath = path.join(scriptsPath, `${taskName}.ts`);

  if (await fs.pathExists(taskFolderPath)) {
    return taskFolderPath;
  }

  if (await fs.pathExists(taskFilePath)) {
    return taskFilePath;
  }

  throw `Task ${taskName} does not exist`;
}

function getTemplateFilePath(fileName?: string) {
  return path.join(__dirname, "template", fileName || "");
}

async function getTaskList() {
  const tasks = await fs.readdir(await getTaskPath(""));
  return tasks
    .filter((t) => !t.startsWith("."))
    .map((t) => t.replace(".ts", ""));
}

async function selectTask(action: string) {
  const tasks = await getTaskList();

  const { task } = await prompts({
    type: "select",
    name: "task",
    choices: [
      ...tasks.map((t) => ({
        title: t,
        value: t,
      })),
      {
        title: "> Cancel",
        value: "",
      },
    ],
    message: `Select a task to ${action}:`,
  });

  return task;
}

//
// Commands
//

import { Command } from "commander";
const program = new Command();
program.version("1.0.0");

enum TMCommand {
  NEW = "new",
  REMOVE = "remove",
  LIST = "list",
  EDIT = "edit",
  FOLDER = "folder",
}

const commandExists: Record<TMCommand, boolean> = {
  [TMCommand.NEW]: true,
  [TMCommand.REMOVE]: true,
  [TMCommand.LIST]: true,
  [TMCommand.EDIT]: true,
  [TMCommand.FOLDER]: true,
};

/**
 *
 *    New Task
 *
 */
program
  .command(TMCommand.NEW)
  .option("-f --full", "Creates the task as full node package")
  .argument("<task>", "The name for the new task")
  .description("Creates a new task")
  .action(async (task: string, options: Record<string, boolean>) => {
    if (options.full) {
      const taskPath = await getTaskPath(task, { ensure: true });

      const npmConfig = await fs.readJson(getTemplateFilePath("package.json"));
      npmConfig.name = task;
      await fs.writeJson(path.join(taskPath, "package.json"), npmConfig);

      await fs.copyFile(
        getTemplateFilePath("tsconfig.json"),
        path.join(taskPath, "tsconfig.json")
      );
      await fs.copyFile(
        getTemplateFilePath("index.ts"),
        path.join(taskPath, "index.ts")
      );
      await execP(`npm i`, { cwd: taskPath });
      return;
    }

    const taskPath = await getTaskPath(task, { file: true, ensure: true });
    await fs.copyFile(getTemplateFilePath("index.ts"), taskPath);
  });

/**
 *
 *    Remove Task
 *
 */
program
  .command(TMCommand.REMOVE)
  .argument("[task]", "The task to remove")
  .description("Deletes an existing task")
  .action(async (task?: string) => {
    if (!task) {
      task = await selectTask("remove");
      if (!task) return;
    }

    const taskPath = await resolveTaskPath(task);

    const { confirmed } = await prompts({
      type: "confirm",
      name: "confirmed",
      message: `Deleting task "${task}", Are you sure ? `,
      initial: true,
    });

    if (confirmed) {
      await fs.remove(taskPath);
    }
  });

/**
 *
 *    Edit Task
 *
 */
program
  .command(TMCommand.EDIT)
  .argument("[task]", "The task to edit")
  .description("Opens a task in vscode")
  .action(async (task?: string) => {
    if (!task) {
      task = await selectTask("edit");
      if (!task) return;
    }

    const taskPath = await resolveTaskPath(task);
    execP(`code ${taskPath}`);
  });

/**
 *
 *    List Task
 *
 */
program
  .command(TMCommand.LIST)
  .description("Lists all available tasks")
  .action(async () => {
    const tasks = await getTaskList();
    console.log(tasks.join("\n"));
  });

/**
 *
 *    Open scripts folder
 *
 */
program
  .command("folder")
  .description("Opens the scripts folder")
  .action(async () => {
    const masterPath = await getTaskMasterPath({ ensure: true });
    await execP(`open ${masterPath}`);
  });

/**
 *
 *    Run Task
 *
 */
program
  .argument("[task]")
  .description("Runs a task")
  .action(async (task?: string) => {
    if (!task) {
      task = await selectTask("run");
      if (!task) throw "Must select a task to run";
    }

    const taskPath = await resolveTaskPath(task);
    let proc: ChildProcess;

    if (taskPath.endsWith(".ts")) {
      const masterPath = await getTaskMasterPath();
      const distPath = path.join(masterPath, "dist");
      const compiledPath = path.join(masterPath, "dist", `${task}.js`);

      if (
        !(await fs.pathExists(compiledPath)) ||
        (await fs.stat(taskPath)).mtime.getTime() >
          (await fs.stat(compiledPath)).mtime.getTime()
      ) {
        await execP(
          `npx tsc ${taskPath} --outdir ${distPath} --esModuleInterop`,
          {
            cwd: masterPath,
          }
        );
      }

      proc = spawn("node", [compiledPath, ...process.argv.slice(3)], {
        stdio: "inherit",
      });
    } else {
      proc = spawn(
        "npx",
        ["ts-node", taskPath, "index.ts", ...process.argv.slice(3)],
        { stdio: "inherit" }
      );
    }

    return new Promise<void>((res) => {
      proc.on("exit", () => res());
    });
  });

(async () => {
  const masterPath = await getTaskMasterPath({ ensure: true });
  const masterPathContents = (await fs.readdir(masterPath)).filter(
    (f) => !f.startsWith(".")
  );

  // If the tm folder isn't populated yet
  if (masterPathContents.length == 0) {
    console.log("Running first stime setup:");
    const spinner = ora({
      text: "Setting up scripts folder...",
      spinner: "arc",
    });
    spinner.start();

    const dependencies = ["package.json", "tsconfig.json"];
    for (const dep of dependencies) {
      await fs.copyFile(getTemplateFilePath(dep), path.join(masterPath, dep));
    }

    spinner.text = "Installing dependencies...";
    await execP("npm i", { cwd: masterPath });

    spinner.stop();
    console.log(`Setup done! Task Master folder can be found at ${masterPath}`);
  }

  const subCommand = process.argv[2];
  if (!commandExists[subCommand as TMCommand]) {
    program.parse(process.argv.slice(0, 3));
  } else {
    program.parse(process.argv);
  }
})();
