// Based on MS-DOS QBasic 1.1
grammar qbasic;

program: line* EOF ;

// Lines have an optional label, then one or more : separated statements.
line: (line_number | text_label ':')? statement (':' statement)* NL ;

statement
  : rem_statement
  | assignment_statement
  | goto_statement
  | print_statement
  | print_using_statement
// Statements can be empty after line labels, before or between :.
  |
  ;

// REM style comments start wherever a statement begins and consume the rest of the line.
// We just include them in the parse tree and ignore them.
rem_statement
  : 'rem' (~NL)*
  ;

// The LET keyword is optional.
assignment_statement
  : 'let'? variable '=' expr
  ;

goto_statement
  : 'goto' (line_number | text_label)
  ;

// PRINT accepts an optional file handle and then zero or more expressions
// separated by a ',' or ';'. There can be a trailing ',' or ';' even if
// there is no other argument.
print_statement
  : 'print' (file_number ',')? print_args (',' | ';')?
  ;

print_args
  : expr
  | expr (',' | ';') print_args
  |
  ;

// PRINT USING must use ';' expression separators - the IDE auto-corrects
// ',' to ';'. The USING format string must always be followed by ';'.
print_using_statement
  : 'print' (file_number ',')? 'using' (string_variable | STRING) ';' print_using_args ';'?
  ;

print_using_args
  : expr
  | expr ';' print_using_args
  |
  ;

// A file number can be any expression that evaluates to a valid file handle
file_number : '#' expr ;

expr
  : literal
  | variable
  ;

// Variables can have weird type sigils appended, or not.
variable
  : float_variable
  | double_variable
  | string_variable
  | int_variable
  | long_variable
  | ID
  ;
float_variable: ID '!' ;
double_variable: ID '#' ;
string_variable: ID '$' ; 
int_variable: ID '%' ;
long_variable: ID '&' ;

literal
  : FLOAT
// '%' is the default for ints so the IDE erases it, but we'll just accept and ignore it.
  | (INT | HEX | OCTAL) ('%' | '&')?
  | STRING
  ;

line_number : INT ;
text_label : ID ;

// Negative numbers are handled by unary minus.
// The IDE strips leading plusses from numbers, so we'll disallow them.
// It also strips leading zeros, but it's simpler to accept and ignore them.
INT : [0-9]+ ;
HEX : '&' 'h' [0-9a-f]+ ;
OCTAL : '&' 'o' [0-7]+ ;
FLOAT
// The IDE expands scientific notation into '!' decimals for numbers
// with 6 or fewer digits, but the language accepts exponents.
  : [0-9]+ '.' [0-9]* EXPONENT? '!'?
  | '.' [0-9]+ EXPONENT? '!'?
  | [0-9]+ EXPONENT '!'?
  | [0-9]+ '!'
  ;
fragment
EXPONENT : 'e' [-+]? [0-9]+ ;
STRING : '"' ~["\r\n]* '"' ;

ID : [A-Za-z][A-Za-z0-9.]* ;

NL : '\r'? '\n' ;
// Note: We skip ' comments here, but REM comments are parsed as statements.
COMMENT : '\'' ~[\r\n]* '\r'? '\n' -> skip;
WS : [ \t]+ -> skip ;