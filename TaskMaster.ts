import * as path from "https://deno.land/std@0.106.0/path/mod.ts";
import {
  Confirm,
  Select,
  Input,
} from "https://deno.land/x/cliffy@v0.19.5/prompt/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v0.19.5/command/mod.ts";
import dir from "https://deno.land/x/dir@v1.1.0/mod.ts";

//
// Deno Convenience Functions
//

async function execute(cmd: string[]) {
  await Deno.run({ cmd }).status();
}

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

//
// Helper Functions
//

function getTaskFolderPath() {
  const homeDir = dir("home");
  if (!homeDir) throw "Could not read home dir";
  return path.join(homeDir, ".tm");
}

function getTaskPath(task: string) {
  const taskFolderPath = getTaskFolderPath();
  const taskPath = path.join(taskFolderPath, `${task}.ts`);
  return taskPath;
}

async function getTaskList() {
  const tasks = await Deno.readDir(getTaskFolderPath());

  const taskNames: string[] = [];
  for await (const task of tasks) {
    if (
      task.isDirectory ||
      task.isSymlink ||
      task.name.startsWith(".") ||
      !task.name.endsWith(".ts")
    )
      continue;
    taskNames.push(task.name.replace(path.extname(task.name), ""));
  }

  return taskNames;
}

async function selectTask(action: string) {
  const tasks = await getTaskList();
  if (!tasks.length) return;

  const task = await Select.prompt({
    options: [
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

async function checkTaskPath(action: string, task?: string) {
  if (!task) {
    task = await selectTask(action);
    if (!task) throw `No task selected to ${action}`;
  }

  const taskPath = getTaskPath(task);
  if (!(await exists(taskPath))) {
    throw `Task ${task} does not exist`;
  }

  return { task, taskPath };
}

//
// Commands
//

const program = new Command();
program
  .name("Task Master")
  .version("1.0.0")
  .description(
    [
      "Task Master is a simple interface for making CLI's with Deno 🦕",
      "",
      'The shorthand: "tm [task] [taskArgs...]" will also run a task',
    ].join("\n")
  );

/**
 *
 *    New Task
 *
 */
program
  .command("new [task]")
  .description("Creates a new task")
  .action(async (_, taskArg?: string) => {
    const task =
      taskArg ||
      (await Input.prompt({
        message: `Enter a name for the new task:`,
      }));

    if (!task) throw `No task name provided`;

    const taskPath = getTaskPath(task);
    await Deno.copyFile(
      new URL("template.ts", import.meta.url).pathname,
      taskPath
    );
    console.log(`Task "${task}" created successfully`);
    await execute(["code", taskPath]);
  });

/**
 *
 *    Remove Task
 *
 */
program
  .command("remove [task]")
  .description("Deletes an existing task")
  .action(async (_, taskArg?: string) => {
    const { task, taskPath } = await checkTaskPath("remove", taskArg);

    const confirmed = await Confirm.prompt({
      message: `Deleting task "${task}", Are you sure ? `,
      default: true,
    });

    if (confirmed) {
      await Deno.remove(taskPath);
      console.log(`Task "${task}" removed successfully`);
    }
  });

/**
 *
 *    Edit Task
 *
 */
program
  .command("edit [task]")
  .description("Opens a task in vscode")
  .action(async (_, taskArg?: string) => {
    const { taskPath } = await checkTaskPath("edit", taskArg);
    await execute(["code", taskPath]);
  });

/**
 *
 *    List Task
 *
 */
program
  .command("list")
  .description("Lists all available tasks")
  .action(async () => {
    const tasks = await getTaskList();
    console.log(tasks.join("\n"));
  });

/**
 *
 *    Open tasks folder
 *
 */
program
  .command("folder")
  .description("Opens the tasks folder")
  .action(async () => {
    await execute(["open", getTaskFolderPath()]);
  });

/**
 *
 *    Run task
 *
 */
program
  .command("run <task> [taskArgs...]")
  .description("Runs a task")
  .action(async (_, taskArg?: string, subTaskArgs: string[] = []) => {
    const { taskPath } = await checkTaskPath("run", taskArg);
    await execute([
      "deno",
      "run",
      "--unstable",
      "--allow-all",
      taskPath,
      ...subTaskArgs,
    ]);
  });

//
//  Main function
//

(async () => {
  const taskFolderPath = getTaskFolderPath();

  const permissions: Record<
    string,
    { perm: Deno.PermissionDescriptor; reason: string }
  > = {
    read: {
      perm: {
        name: "read",
        path: taskFolderPath,
      },
      reason: `TM needs the read permission to load task files in ${taskFolderPath}`,
    },
    write: {
      perm: {
        name: "write",
        path: taskFolderPath,
      },
      reason: `TM needs the write permission to create new task files in ${taskFolderPath}`,
    },
    run: {
      perm: {
        name: "run",
      },
      reason: `TM needs the run permission to execute tasks`,
    },
    env: {
      perm: {
        name: "env",
      },
      reason: `TM needs the env permission to create a folder in the home directory`,
    },
  };

  for (const [permKey, { perm, reason }] of Object.entries(permissions)) {
    let status = await Deno.permissions.query(perm);
    if (status.state !== "granted") {
      console.log(reason);
      status = await Deno.permissions.request(perm);
    }

    if (status.state !== "granted") {
      throw `Error: critical permission: "${permKey}" not granted`;
    }
  }

  // If the tm folder isn't populated yet
  if (!(await exists(taskFolderPath))) {
    await Deno.mkdir(taskFolderPath);
    console.log(`Made tasks folder at ${taskFolderPath}`);
  }

  try {
    if (!Deno.args?.length) {
      throw "No arguments supplied to task-master";
    }

    const task = Deno.args[0];
    await checkTaskPath("run", task)
      .then(({ taskPath }) =>
        execute([
          "deno",
          "run",
          "--unstable",
          "--allow-all",
          taskPath,
          ...Deno.args.slice(1),
        ])
      )
      .catch(() => program.parse(Deno.args));
  } catch (err) {
    console.error("Error:", err);
  }
})();
