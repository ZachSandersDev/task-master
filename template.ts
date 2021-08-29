import { Command } from "https://deno.land/x/cliffy@v0.19.5/command/mod.ts";
import {} from "https://deno.land/x/cliffy@v0.19.5/prompt/mod.ts";

const program = new Command();
program.name("Your command's name!").version("1.0.0");

//  Optionally, add some sub commands!
//
//  program.command("someCommand")
//  .arguments("[anArg]")
//  .description("A description of some kind")
//  .action(() => {})

// Main action (runs when no sub commands match)
program.action(() => {
  // Your script here!
});

// Runs your script
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
