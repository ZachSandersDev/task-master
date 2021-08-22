#!/usr/bin/env node

import os from "os"
import path from "path";
import { promisify } from "util"
import { exec, spawn } from "child_process"

import fs from "fs-extra";
import prompts from "prompts"

// 
// Helper Functions
// 

const execP = promisify(exec);

async function getTaskPath(taskName: string, { ensure, checkExists }: { ensure?: boolean, checkExists?: boolean } = {}) {

  const taskPath = path.join(os.homedir(), ".tm", "scripts", taskName);

  if (ensure) {
    await fs.ensureDir(taskPath);
  }

  if (checkExists && !(await fs.pathExists(taskPath))) {
    throw `task "${taskName}" does not exist`;
  }

  return taskPath
}

async function getTaskList() {
  const tasks = await fs.readdir(await getTaskPath(""));
  return tasks.filter(t => !t.startsWith("."));
}

async function selectTask(action: string) {
  const tasks = await getTaskList();

  const { task } = await prompts({
    type: 'select',
    name: "task",
    choices: [...tasks.map(t => ({
      title: t,
      value: t
    })),
    {
      title: "> Cancel",
      value: ""
    }],
    message: `Select a task to ${action}:`
  })

  return task
}

//
// Handlers
//

function handleCommand(command: string) {

  if (!command) {
    console.log(`
Task Master Help:

  Commands: 
    new     <task name>   | Creates a new task

    remove  <task name>   | Deletes an existing task

    edit    <task name>   | Opens a task in vscode

    <task name>           | Runs a task you've created 
    `)
    return;
  }

  switch (command) {
    case 'list':
      return listTasks();
    case 'new':
      return newTask(process.argv[3]);
    case 'remove':
      return removeTask(process.argv[3]);
    case 'edit':
      return editTask(process.argv[3]);
    default:
      return runTask(command);
  }
}

async function listTasks() {
  const tasks = await getTaskList();
  console.log(tasks.join("\n"))
}

async function newTask(taskName?: string) {

  if (!taskName) {
    const result = await prompts({
      type: "text",
      name: "taskName",
      message: `Enter a name for the task:`
    })

    taskName = result.taskName as string;
    if (!taskName) throw "A task name is required";
  }

  const taskPath = await getTaskPath(taskName, { ensure: true });
  const npmConfig = await fs.readJson(path.join(__dirname, "templates", "package.json"));
  const tsConfig = await fs.readFile(path.join(__dirname, "templates", "tsconfig.json"), 'utf8');

  npmConfig.name = taskName;

  await fs.writeJson(path.join(taskPath, "package.json"), npmConfig);
  await fs.writeFile(path.join(taskPath, "tsconfig.json"), tsConfig);
  await fs.ensureFile(path.join(taskPath, "src", "index.ts"));

  await execP(`npm i`, { cwd: taskPath });
}

async function removeTask(taskName?: string) {

  if (!taskName) {
    taskName = await selectTask("remove");
    if (!taskName) return;
  }

  const taskPath = await getTaskPath(taskName, { checkExists: true });

  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: `Deleting task "${taskName}", Are you sure?`,
    initial: true
  })

  if (confirmed) {
    await fs.remove(taskPath);
  }
}

async function editTask(taskName: string) {
  if (!taskName) {
    taskName = await selectTask("edit");
    if (!taskName) return;
  }

  const taskPath = await getTaskPath(taskName, { checkExists: true });
  execP(`code ${taskPath}`);
}

async function runTask(task: string) {
  const taskPath = await getTaskPath(task, { checkExists: true });
  await execP(`npm run --prefix ${taskPath} build`);

  const proc = spawn("node", [`${taskPath}/dist/index.js`], { stdio: 'inherit' });

  return new Promise<void>((res) => {
    proc.on('exit', () => res());
  })
}

(async function () {
  const command = process.argv[2];
  try {
    await handleCommand(command);
  } catch (err) {
    console.error(`Error: ${err}`);
  }
})()
