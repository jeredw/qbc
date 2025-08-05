' Bug: Inserting into empty fixed length strings with MID$ statement should work.
dim s as string * 4
mid$(s, 2, 2) = "ok"
print s