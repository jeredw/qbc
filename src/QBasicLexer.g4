// Based on MS-DOS QBasic 1.1
lexer grammar QBasicLexer;

// Operators and punctuation
// For legibility, the parser grammar doesn't actually use these token names,
// but they have to be defined here.
COLON : ':' ;
LEFT_PAREN : '(' ;
RIGHT_PAREN : ')' ;
NUMBER : '#' ;
DIVIDE : '/' ;
INTEGER_DIVIDE : '\\' ;
EXP : '^' ;
MINUS : '-' ;
PLUS : '+' ;
TIMES : '*' ;
COMMA : ',' ;
SEMICOLON : ';' ;
LT : '<' ;
LE : '<=' ;
NE : '<>' ;
EQ : '=' ;
GT : '>' ;
GE : '>=' ;
AMP : '&' ;
PERCENT : '%' ;
DOT : '.' ;

// Literals
DIGITS : [0-9]+ ;
HEX : '&' [hH] [0-9a-fA-F]+ ;
OCTAL : '&' [oO] [0-7]+ ;
PROBABLY_SINGLE_PRECISION_NUMBER
// The IDE expands scientific notation into '!' decimals for numbers
// with 6 or fewer digits, but the language accepts exponents.
  : [0-9]+ '.' [0-9]* (E_EXPONENT | '!')?
  | '.' [0-9]+ (E_EXPONENT | '!')?
  | [0-9]+ (E_EXPONENT | '!')?
  | [0-9]+ '!'
  ;
fragment E_EXPONENT : [eE] [-+]? [0-9]+ ;
// If a decimal number has a 'd' exponent or a '#' it's a double.
DOUBLE_PRECISION_NUMBER
  : [0-9]+ '.' [0-9]* (D_EXPONENT | '#')
  | '.' [0-9]+ (D_EXPONENT | '#')
  | [0-9]+ (D_EXPONENT | '#')
  ;
fragment D_EXPONENT : [dD] [-+]? [0-9]+ ;
// The IDE automatically closes string literals that don't end with ".
// This comes up most often in old GW-BASIC programs.
STRING_LITERAL : '"' ~["\r\n]* '"'? ;

// Keywords, statements and functions that are not parsed as builtins.
ABSOLUTE : [Aa][Bb][Ss][Oo][Ll][Uu][Tt][Ee] ;
ACCESS : [Aa][Cc][Cc][Ee][Ss][Ss] ;
AND : [Aa][Nn][Dd] ;
ANY : [Aa][Nn][Yy] ;
APPEND : [Aa][Pp][Pp][Ee][Nn][Dd] ;
AS : [Aa][Ss] ;
BASE : [Bb][Aa][Ss][Ee] ;
BINARY : [Bb][Ii][Nn][Aa][Rr][Yy] ;
CALL : [Cc][Aa][Ll][Ll] ;
CASE : [Cc][Aa][Ss][Ee] ;
CIRCLE : [Cc][Ii][Rr][Cc][Ll][Ee] ;
CLEAR : [Cc][Ll][Ee][Aa][Rr] ;
CLOSE : [Cc][Ll][Oo][Ss][Ee] ;
COLOR : [Cc][Oo][Ll][Oo][Rr] ;
COM : [Cc][Oo][Mm] ;
COMMON : [Cc][Oo][Mm][Mm][Oo][Nn] ;
CONST : [Cc][Oo][Nn][Ss][Tt] ;
DATA : [Dd][Aa][Tt][Aa] -> pushMode(DATA_MODE);
DATE_STRING : [Dd][Aa][Tt][Ee] '$' ;
DECLARE : [Dd][Ee][Cc][Ll][Aa][Rr][Ee] ;
DEF : [Dd][Ee][Ff] ;
DEFDBL : [Dd][Ee][Ff][Dd][Bb][Ll] ;
DEFINT : [Dd][Ee][Ff][Ii][Nn][Tt] ;
DEFLNG : [Dd][Ee][Ff][Ll][Nn][Gg] ;
DEFSNG : [Dd][Ee][Ff][Ss][Nn][Gg] ;
DEFSTR : [Dd][Ee][Ff][Ss][Tt][Rr] ;
DIM : [Dd][Ii][Mm] ;
DO : [Dd][Oo] ;
DOUBLE : [Dd][Oo][Uu][Bb][Ll][Ee] ;
ELSE : [Ee][Ll][Ss][Ee] ;
ELSEIF : [Ee][Ll][Ss][Ee][Ii][Ff] ;
END : [Ee][Nn][Dd] ;
ENDIF : [Ee][Nn][Dd][Ii][Ff] ;
ENVIRON : [Ee][Nn][Vv][Ii][Rr][Oo][Nn] ;
ENVIRON_STRING : [Ee][Nn][Vv][Ii][Rr][Oo][Nn] '$' ;
EQV : [Ee][Qq][Vv] ;
ERASE : [Ee][Rr][Aa][Ss][Ee] ;
ERDEV : [Ee][Rr][Dd][Ee][Vv] ;
ERDEV_STRING : [Ee][Rr][Dd][Ee][Vv] '$' ;
ERROR : [Ee][Rr][Rr][Oo][Rr] ;
EXIT : [Ee][Xx][Ii][Tt] ;
FIELD : [Ff][Ii][Ee][Ll][Dd] ;
FOR : [Ff][Oo][Rr] ;
FN : [Ff][Nn] ;
FUNCTION : [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] ;
GET : [Gg][Ee][Tt] ;
GOSUB : [Gg][Oo][Ss][Uu][Bb] ;
GOTO : [Gg][Oo][Tt][Oo] ;
IF : [Ii][Ff] ;
IMP : [Ii][Mm][Pp] ;
INPUT : [Ii][Nn][Pp][Uu][Tt] ;
INPUT_STRING : [Ii][Nn][Pp][Uu][Tt] '$' ;
INSTR : [Ii][Nn][Ss][Tt][Rr] ;
IOCTL : [Ii][Oo][Cc][Tt][Ll] ;
IOCTL_STRING : [Ii][Oo][Cc][Tt][Ll] '$' ;
IS : [Ii][Ss] ;
INTEGER : [Ii][Nn][Tt][Ee][Gg][Ee][Rr] ;
KEY : [Kk][Ee][Yy] ;
LBOUND : [Ll][Bb][Oo][Uu][Nn][Dd] ;
LEN : [Ll][Ee][Nn] ;
LET : [Ll][Ee][Tt] ;
LINE : [Ll][Ii][Nn][Ee] ;
LIST : [Ll][Ii][Ss][Tt] ;
LOCATE : [Ll][Oo][Cc][Aa][Tt][Ee] ;
LOCK : [Ll][Oo][Cc][Kk] ;
LONG : [Ll][Oo][Nn][Gg] ;
LOOP : [Ll][Oo][Oo][Pp] ;
LPRINT : [Ll][Pp][Rr][Ii][Nn][Tt] ;
LSET : [Ll][Ss][Ee][Tt] ;
MID_STRING : [Mm][Ii][Dd] '$';
MOD : [Mm][Oo][Dd] ;
NAME : [Nn][Aa][Mm][Ee] ;
NEXT : [Nn][Ee][Xx][Tt] -> pushMode(NEXT_MODE) ;
NOT : [Nn][Oo][Tt] ;
OPTION : [Oo][Pp][Tt][Ii][Oo][Nn] ;
OFF : [Oo][Ff][Ff] ;
OPEN : [Oo][Pp][Ee][Nn] ;
OUTPUT : [Oo][Uu][Tt][Pp][Uu][Tt] ;
OR : [Oo][Rr] ;
ON : [Oo][Nn] ;
PAINT : [Pp][Aa][Ii][Nn][Tt] ;
PALETTE : [Pp][Aa][Ll][Ee][Tt][Tt][Ee] ;
PEN : [Pp][Ee][Nn] ;
PLAY : [Pp][Ll][Aa][Yy] ;
PRESET : [Pp][Rr][Ee][Ss][Ee][Tt] ;
PRINT : [Pp][Rr][Ii][Nn][Tt] ;
PSET : [Pp][Ss][Ee][Tt] ;
PUT : [Pp][Uu][Tt] ;
QUESTION_MARK : '?' ;
RANDOM : [Rr][Aa][Nn][Dd][Oo][Mm] ;
RANDOMIZE : [Rr][Aa][Nn][Dd][Oo][Mm][Ii][Zz][Ee] ;
READ : [Rr][Ee][Aa][Dd] ;
REDIM : [Rr][Ee][Dd][Ii][Mm] ;
// Scanned separately for REM comments because we need a separator between
// REM statements and the meta statements.
REM_META_DYNAMIC : [Rr][Ee][Mm] [ \t]* '$' [Dd][Yy][Nn][Aa][Mm][Ii][Cc] ~[\r\n]* ;
REM_META_STATIC : [Rr][Ee][Mm] [ \t]* '$' [Ss][Tt][Aa][Tt][Ii][Cc] ~[\r\n]* ;
REM_META_INCLUDE : [Rr][Ee][Mm] [ \t]* '$' [Ii][Nn][Cc][Ll][Uu][Dd][Ee] ~[\r\n]* ;
REM : [Rr][Ee][Mm] -> pushMode(COMMENT_MODE);
RESTORE : [Rr][Ee][Ss][Tt][Oo][Rr][Ee] ;
RESUME : [Rr][Ee][Ss][Uu][Mm][Ee] ;
// antlr's parser can't figure out how to parse "resume next" inside an inline
// if, probably due to ambiguity with for .. next.
RESUME_NEXT : [Rr][Ee][Ss][Uu][Mm][Ee] [ \t]+ [Nn][Ee][Xx][Tt];
RETURN : [Rr][Ee][Tt][Uu][Rr][Nn] ;
RSET : [Rr][Ss][Ee][Tt] ;
RUN : [Rr][Uu][Nn] ;
SCREEN : [Ss][Cc][Rr][Ee][Ee][Nn] ;
SADD : [Ss][Aa][Dd][Dd] ;
SEEK : [Ss][Ee][Ee][Kk] ;
SEG : [Ss][Ee][Gg] ;
SELECT : [Ss][Ee][Ll][Ee][Cc][Tt] ;
SHARED : [Ss][Hh][Aa][Rr][Ee][Dd] ;
SINGLE : [Ss][Ii][Nn][Gg][Ll][Ee] ;
SPC : [Ss][Pp][Cc] ;
STATIC : [Ss][Tt][Aa][Tt][Ii][Cc] ;
STEP : [Ss][Tt][Ee][Pp] ;
STOP : [Ss][Tt][Oo][Pp] ;
STRIG : [Ss][Tt][Rr][Ii][Gg] ;
STRING : [Ss][Tt][Rr][Ii][Nn][Gg] ;
SUB : [Ss][Uu][Bb] ;
SWAP : [Ss][Ww][Aa][Pp] ;
TAB : [Tt][Aa][Bb] ;
THEN : [Tt][Hh][Ee][Nn] ;
TIMER : [Tt][Ii][Mm][Ee][Rr] ;
TIME_STRING : [Tt][Ii][Mm][Ee] '$' ;
TO : [Tt][Oo] ;
TYPE : [Tt][Yy][Pp][Ee] ;
UBOUND : [Uu][Bb][Oo][Uu][Nn][Dd] ;
UNLOCK : [Uu][Nn][Ll][Oo][Cc][Kk] ;
UNTIL : [Uu][Nn][Tt][Ii][Ll] ;
USING : [Uu][Ss][Ii][Nn][Gg] ;
VIEW : [Vv][Ii][Ee][Ww] ;
WEND : [Ww][Ee][Nn][Dd] ;
WHILE : [Ww][Hh][Ii][Ll][Ee] ;
WIDTH : [Ww][Ii][Dd][Tt][Hh] ;
WINDOW : [Ww][Ii][Nn][Dd][Oo][Ww] ;
WRITE : [Ww][Rr][Ii][Tt][Ee] ;
VARPTR : [Vv][Aa][Rr][Pp][Tt][Rr] ;
VARPTR_STRING : [Vv][Aa][Rr][Pp][Tt][Rr] '$' ;
VARSEG : [Vv][Aa][Rr][Ss][Ee][Gg] ;
XOR : [Xx][Oo][Rr] ;

// Note that IDs with type sigils can have the same name as keywords, so we
// have to include type sigils themselves in the tokens.

// IDs prefixed with FN are special cased as user-defined functions and not
// allowed in many places where IDs are allowed.
FNID : [Ff][Nn][A-Za-z][A-Za-z0-9.]* TYPE_SIGIL? ;
// ID matches identifier names not starting with FN.
// QBasic enforces that IDs are at most 40 characters long, but this grammar
// does not have a limit.
ID : [A-EG-Za-eg-z][A-Za-z0-9.]* TYPE_SIGIL?
   | [Ff][A-MO-Za-mo-z0-9.][A-Za-z0-9.]* TYPE_SIGIL?
   | [Ff] TYPE_SIGIL?
   ;

fragment TYPE_SIGIL :
  ( '!'   // Single-precision float
  | '#'   // Double-precision float
  | '$'   // String
  | '%'   // Integer (16 bits)
  | '&' ) // Long integer (32 bits)
  ;

// The IDE doesn't support typing them, but QBASIC /RUN will combine '_'
// continued lines.
CONTINUED_LINE : '_' '\r'? '\n' -> skip ;
NL : '\r'? '\n' ;
COMMENT : '\'' -> type(NL), pushMode(COMMENT_MODE) ;
// Some old DOS programs have explicit ctrl+Z EOF markers.
WS : [ \t\u001a]+ -> skip ;

// Use a mode to capture just text so it can be checked for metacommands.
mode COMMENT_MODE;

// Metacommands are comments that begin with $command.  QBasic only supports
// $STATIC and $DYNAMIC, but also parses $INCLUDE and shows an error "Advanced
// feature unavailable".
//
// We parse these as statements by making the start of comment act as a newline
// to terminate the current statement, slurping all the comment text for the
// metacommand, then using the final NL to terminate the metacommand statement.
COMMENT_META_DYNAMIC : [ \t]* '$' [Dd][Yy][Nn][Aa][Mm][Ii][Cc] ~[\r\n]* ;
COMMENT_META_STATIC : [ \t]* '$' [Ss][Tt][Aa][Tt][Ii][Cc] ~[\r\n]* ;
COMMENT_META_INCLUDE : [ \t]* '$' [Ii][Nn][Cc][Ll][Uu][Dd][Ee] ~[\r\n]* ;
COMMENT_TEXT : ~[\r\n]+ -> skip ;
// Pass through this NL to terminate a possible metacommand.
COMMENT_NL : '\r'? '\n' -> type(NL), popMode ;

// This mode turns ',' into a special NEXT keyword so we can parse
// NEXT i, j as NEXT i : NEXT j.
mode NEXT_MODE;

NEXT_WITH_MANDATORY_ID : ',' ;
// Hack: Inline if permits "ELSE" to terminate the THEN statement.
// Only in this context, we have to treat ELSE as a statement terminator.
// (Must recognize this before ID or we'll scan it as another NEXT_ID...)
NEXT_ELSE : [Ee][Ll][Ss][Ee] -> type(ELSE), popMode ;
// Have to replicate ID here to recognize NEXT ID?
NEXT_ID : ([A-EG-Za-eg-z][A-Za-z0-9.]* TYPE_SIGIL?
        | [Ff][A-MO-Za-mo-z0-9.][A-Za-z0-9.]* TYPE_SIGIL?
        | [Ff] TYPE_SIGIL?) -> type(ID)
        ;
NEXT_CONTINUED_LINE : '_' '\r'? '\n' -> skip ;
NEXT_NL : '\r'? '\n' -> type(NL), popMode ;
NEXT_COLON : ':' -> type(COLON), popMode ;
NEXT_WS : [ \t\u001a]+ -> skip ;
// Do not pushMode, so that COMMENT_MODE pops back to DEFAULT_MODE.
NEXT_COMMENT : '\'' -> type(NL), mode(COMMENT_MODE) ;

// DATA statements have CSV-like lexical rules, and don't support ' comments
// or expressions.
mode DATA_MODE;

// Commas delimit fields.
DATA_COMMA : ',' ;
// : or NL ends the data statement.
DATA_COLON : ':' -> type(COLON), popMode ;
DATA_NL : '\r'? '\n' -> type(NL), popMode ;
// Everything between quotes is captured literally.
// Note: Close quote at end of line seems to be optional.
DATA_QUOTED : '"' ~["\r\n]* ('"'?) ;
// Otherwise, capture everything except leading and trailing whitespace.
DATA_UNQUOTED : ~[ \t,\n\r:]   // _ "x" _
              | ~[ \t,\n\r:]~[ \t,\n\r:] // _ "xy" _
              | ~[ \t,\n\r:]~[,\n\r:]+~[ \t,\n\r:] ; // _ "x_y_z" _
// Whitespace before and after fields is ignored.
DATA_WS : [ \t\u001a]+ -> skip ;
