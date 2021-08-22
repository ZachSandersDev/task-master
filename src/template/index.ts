import { Command } from "commander"

const program = new Command();
program.version("1.0.0")

//  Optionally, add some sub commands!
//  
//  program.command("someCommand")
//  .argument("[anArg]")
//  .description("A description of some kind")
//  .action(() => {})



// Main action (runs when no sub commands match)
program.action(() => {
  // Your script here!

});



// Runs your script
(() => {
  process.on('unhandledRejection', error => {
    console.error(error);
  });
  program.parse(process.argv)
})()
