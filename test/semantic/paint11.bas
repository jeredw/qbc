' Test that paint does flood out from an already painted start pixel.
screen 12
line (90, 90)-(140, 140), 2, bf
line (100, 100)-(120, 120), 7, bf
line (100, 120)-(120, 130), 15, bf
line (100, 100)-(100, 130), 0
line (120, 100)-(120, 130), 0
line (100, 130)-(120, 130), 0
paint (102, 100), 7, 0