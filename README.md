# Task Master

A tool for making CLIs with Deno 🦕

## Usage

Add command `tm` to `$PATH` (only for zsh currently):

```
$ ./install.sh
```

Create a new task:

```
$ tm new [task]
```

Run the task:

```
$ tm [task]
```

## Options

| Option          | Description               |
| --------------- | ------------------------- |
| `-h, --help`    | Show help menu            |
| `-V, --version` | Prints the version number |

## Commands

| Command   | Arguments               | Description               |
| --------- | ----------------------- | ------------------------- |
| `<task>`  | `[taskArgs...] `        | Shorthand to run a task   |
| `run`     | `<task> [taskArgs...] ` | Runs a task               |
| `new`     | `[task]`                | Creates a new task        |
| `edit`    | `[task]`                | Opens a task in vscode    |
| `remove`  | `[task]`                | Deletes an existing task  |
| `list `   |                         | Lists all available tasks |
| `folder ` |                         | Opens the tasks folder    |
