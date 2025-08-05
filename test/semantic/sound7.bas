' Bug: This should make a chirpy blip, not just be silent.
for i = 500 to 1500 step 35
  sound i, i / 20000
next