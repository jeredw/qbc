' Help file examples for PRINT USING format specifiers.
A$ = "LOOK" : B$ = "OUT"
PRINT USING "!"; A$; B$            'First characters of A$ and B$.
PRINT USING "\  \"; A$; B$         'Two spaces between backslashes,
                                   'prints four characters from A$.
PRINT USING "\   \"; A$; B$; "!!"  'Three spaces, prints A$ and
                                   'a blank.
PRINT USING "!"; A$;               'First character from A$ and
PRINT USING "&"; B$                'all of B$ on one line.

PRINT USING "##.##"; .78
PRINT USING "###.##"; 987.654
PRINT USING "##.##   "; 10.2, 5.3, 66.789, .234
PRINT USING "+##.##   "; -68.95, 2.4, 55.6, -.9
PRINT USING "##.##-   "; -68.95, 22.449, -7.01
PRINT USING "**#.#   "; 12.39, -0.9, 765.1
PRINT USING "$$###.##"; 456.78
PRINT USING "**$##.##"; 2.34
PRINT USING "####,.##"; 1234.5
PRINT USING "##.##^^^^"; 234.56
PRINT USING ".####^^^^-"; -888888
PRINT USING "+.##^^^^"; 123
PRINT USING "+.##^^^^^"; 123
PRINT USING "_!##.##_!"; 12.34
PRINT USING "##.##"; 111.22
PRINT USING ".##"; .999