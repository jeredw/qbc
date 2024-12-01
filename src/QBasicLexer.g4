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
EQV : [Ee][Qq][Vv] ;
ERROR : [Ee][Rr][Rr][Oo][Rr] ;
END : [Ee][Nn][Dd] ;
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
IOCTL : [Ii][Oo][Cc][Tt][Ll] ;
IOCTL_STRING : [Ii][Oo][Cc][Tt][Ll] '$' ;
IS : [Ii][Ss] ;
INTEGER : [Ii][Nn][Tt][Ee][Gg][Ee][Rr] ;
KEY : [Kk][Ee][Yy] ;
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
PRINT : [Pp][Rr][Ii][Nn][Tt] ;
PRESET : [Pp][Rr][Ee][Ss][Ee][Tt] ;
PSET : [Pp][Ss][Ee][Tt] ;
PUT : [Pp][Uu][Tt] ;
RANDOM : [Rr][Aa][Nn][Dd][Oo][Mm] ;
READ : [Rr][Ee][Aa][Dd] ;
REDIM : [Rr][Ee][Dd][Ii][Mm] ;
REM : [Rr][Ee][Mm] -> pushMode(COMMENT_MODE) ;
RESUME : [Rr][Ee][Ss][Uu][Mm][Ee] ;
RETURN : [Rr][Ee][Tt][Uu][Rr][Nn] ;
RSET : [Rr][Ss][Ee][Tt] ;
SCREEN : [Ss][Cc][Rr][Ee][Ee][Nn] ;
SEEK : [Ss][Ee][Ee][Kk] ;
SEG : [Ss][Ee][Gg] ;
SELECT : [Ss][Ee][Ll][Ee][Cc][Tt] ;
SHARED : [Ss][Hh][Aa][Rr][Ee][Dd] ;
SINGLE : [Ss][Ii][Nn][Gg][Ll][Ee] ;
STATIC : [Ss][Tt][Aa][Tt][Ii][Cc] ;
STEP : [Ss][Tt][Ee][Pp] ;
STOP : [Ss][Tt][Oo][Pp] ;
STRIG : [Ss][Tt][Rr][Ii][Gg] ;
STRING : [Ss][Tt][Rr][Ii][Nn][Gg] ;
SUB : [Ss][Uu][Bb];
THEN : [Tt][Hh][Ee][Nn] ;
TO : [Tt][Oo] ;
TYPE : [Tt][Yy][Pp][Ee] ;
TIMER : [Tt][Ii][Mm][Ee][Rr] ;
UNLOCK : [Uu][Nn][Ll][Oo][Cc][Kk] ;
UNTIL : [Uu][Nn][Tt][Ii][Ll] ;
USING : [Uu][Ss][Ii][Nn][Gg] ;
VIEW : [Vv][Ii][Ee][Ww] ;
WEND : [Ww][Ee][Nn][Dd] ;
WHILE : [Ww][Hh][Ii][Ll][Ee] ;
WIDTH : [Ww][Ii][Dd][Tt][Hh] ;
WINDOW : [Ww][Ii][Nn][Dd][Oo][Ww] ;
WRITE : [Ww][Rr][Ii][Tt][Ee] ;
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
COMMENT : '\'' -> skip, pushMode(COMMENT_MODE) ;
// Some old DOS programs have explicit ctrl+Z EOF markers.
WS : [ \t\u001a]+ -> skip ;

// Use a mode to capture just text so it can be checked for metacommands.
mode COMMENT_MODE;

// *** Should be checked for $STATIC and $DYNAMIC.
// QBasic also parses $INCLUDE, but shows an error "Advanced feature
// unavailable".
COMMENT_TEXT : ~[\r\n]+ -> channel(HIDDEN) ;
// The final NL must be passed through to terminate REM statements.
COMMENT_NL : '\r'? '\n' -> type(NL), popMode ;

// This mode turns ',' into a special NEXT keyword so we can parse
// NEXT i, j as NEXT i : NEXT j.
mode NEXT_MODE;

NEXT_WITH_MANDATORY_ID : ',' ;
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
NEXT_COMMENT : '\'' -> skip, mode(COMMENT_MODE) ;

// DATA statements have CSV-like lexical rules, and don't support ' comments
// or expressions.
mode DATA_MODE;

// Commas delimit fields.
DATA_COMMA : ',' ;
// : or NL ends the data statement.
DATA_COLON : ':' -> type(COLON), popMode ;
DATA_NL : '\r'? '\n' -> type(NL), popMode ;
// Everything between quotes is captured literally.
DATA_QUOTED : '"' ~["\r\n]* '"' ;
// Otherwise, capture everything except leading and trailing whitespace.
DATA_UNQUOTED : ~[ \t,\n\r:]   // _ "x" _
              | ~[ \t,\n\r:]~[ \t,\n\r:] // _ "xy" _
              | ~[ \t,\n\r:]~[,\n\r:]+~[ \t,\n\r:] ; // _ "x_y_z" _
// Whitespace before and after fields is ignored.
DATA_WS : [ \t\u001a]+ -> skip ;
