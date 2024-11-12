// Based on MS-DOS QBasic 1.1
grammar qbasic;

program: line* EOF ;

// Lines have an optional label, then one or more : separated statements.
line: (line_number | text_label ':')? statement (':' statement)* NL ;

statement
  : rem_statement
  | assignment_statement
  | deftype_statement
  | dim_statement
  | goto_statement
  | print_statement
  | print_using_statement
// Statements can be empty after line labels, before or between :.
  |
  ;

// REM style comments start wherever a statement begins and consume the rest of the line.
// We just include them in the parse tree and ignore them.
rem_statement
  : REM (~NL)*
  ;

// The LET keyword is optional.
assignment_statement
  : LET? variable '=' expr
  ;

deftype_statement
  : DEFINT letter_range (',' letter_range)*
  | DEFLNG letter_range (',' letter_range)*
  | DEFSNG letter_range (',' letter_range)*
  | DEFDBL letter_range (',' letter_range)*
  | DEFSTR letter_range (',' letter_range)*
  ;

// TODO: arrays
dim_statement
  : DIM SHARED? ID AS as_type_name
  | REDIM SHARED? ID AS as_type_name
  ;

// A system or user-defined type following an AS keyword.
// We could just match ID here but need to define tokens for type names
// anyway so they can't be IDs...
as_type_name
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | STRING '*' INT
  | ID
  ;

// Supporting ranges like A-Z in the lexer is messy since that's also an
// expression...  and the IDE allows any ID-ID here and strips down to
// the first letter, so relax ranges to permit any ID.
letter_range: ID | ID '-' ID ;

goto_statement
  : GOTO (line_number | text_label)
  ;

// PRINT accepts an optional file handle and then zero or more expressions
// separated by a ',' or ';'. There can be a trailing ',' or ';' even if
// there is no other argument.
print_statement
  : PRINT (file_number ',')? print_args (',' | ';')?
  ;

print_args
  : expr
  | expr (',' | ';') print_args
  |
  ;

// PRINT USING must use ';' expression separators - the IDE auto-corrects
// ',' to ';'. The USING expr must be a format string, and must always be
// followed by ';'.
print_using_statement
  : PRINT (file_number ',')? USING expr ';' print_using_args ';'?
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

// Variables can have type sigils appended.
variable : ID ('!' | '#' | '$' | '%' | '&')? ;

literal
// Single precision unless value requires double precision.
  : PROBABLY_SINGLE_PRECISION_NUMBER
  | DOUBLE_PRECISION_NUMBER
// The IDE erases trailing % from ints.
// Trailling % on a too-long literal is a syntax error.
  | (INT | HEX | OCTAL) ('%' | '&')?
  | STRING_LITERAL
  ;

// Admits negative line numbers because it's simpler to have the lexer
// always match [0-9]+ as INT.
line_number : INT ;
text_label : ID ;

// Treat '-' as part of INT because -32768 can't be represented as - (32768) in
// 2's complement arithmetic.  The IDE strips whitespace between '-' and a
// number, so admit this.  The IDE also strips unary plus from expressions in
// general, not just numbers, so there is no need to specialize that here.
// The IDE strips leading zeros, so accept those.
INT : '-'? [0-9]+ ;
// Hex and octal constants cannot have leading minus.
HEX : '&' [hH] [0-9a-fA-F]+ ;
OCTAL : '&' [oO] [0-7]+ ;
PROBABLY_SINGLE_PRECISION_NUMBER
// The IDE expands scientific notation into '!' decimals for numbers
// with 6 or fewer digits, but the language accepts exponents.
  : [0-9]+ '.' [0-9]* E_EXPONENT? '!'?
  | '.' [0-9]+ E_EXPONENT? '!'?
  | [0-9]+ E_EXPONENT '!'?
  | [0-9]+ '!'
  ;
fragment
E_EXPONENT : [eE] [-+]? [0-9]+ ;
// If a decimal number has a 'd' exponent or a '#' it's a double.
DOUBLE_PRECISION_NUMBER
  : [0-9]+ '.' [0-9]* (D_EXPONENT | '#')
  | '.' [0-9]+ (D_EXPONENT | '#')
  | [0-9]+ (D_EXPONENT | '#')
  ;
fragment
D_EXPONENT : [dD] [-+]? [0-9]+ '#'?;
STRING_LITERAL : '"' ~["\r\n]* '"' ;

// Keywords
AS : [Aa][Ss] ;
DEFDBL : [Dd][Ee][Ff][Dd][Bb][Ll] ;
DEFINT : [Dd][Ee][Ff][Ii][Nn][Tt] ;
DEFLNG : [Dd][Ee][Ff][Ll][Nn][Gg] ;
DEFSNG : [Dd][Ee][Ff][Ss][Nn][Gg] ;
DEFSTR : [Dd][Ee][Ff][Ss][Tt][Rr] ;
DIM : [Dd][Ii][Mm] ;
DOUBLE : [Dd][Oo][Uu][Bb][Ll][Ee] ;
GOTO : [Gg][Oo][Tt][Oo] ;
INTEGER : [Ii][Nn][Tt][Ee][Gg][Ee][Rr] ;
LET : [Ll][Ee][Tt] ;
LONG : [Ll][Oo][Nn][Gg] ;
PRINT : [Pp][Rr][Ii][Nn][Tt] ;
REDIM : [Rr][Ee][Dd][Ii][Mm] ;
REM : [Rr][Ee][Mm] ;
SHARED : [Ss][Hh][Aa][Rr][Ee][Dd] ;
SINGLE : [Ss][Ii][Nn][Gg][Ll][Ee] ;
STRING : [Ss][Tt][Rr][Ii][Nn][Gg] ;
USING : [Uu][Ss][Ii][Nn][Gg] ;

// Note id has lower precedence than keywords
ID : [A-Za-z][A-Za-z0-9.]* ;

NL : '\r'? '\n' ;
// Note: We skip ' comments here, but REM comments are parsed as statements.
COMMENT : '\'' ~[\r\n]* '\r'? '\n' -> skip;
WS : [ \t]+ -> skip ;