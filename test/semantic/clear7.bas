' Test that clear closes open files.
open "test" for output as #1
clear
open "test" for output as #1