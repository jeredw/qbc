// Based on MS-DOS QBasic 1.1
lexer grammar qbasiclexer;

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
AND : [Aa][Nn][Dd] ;
ANY : [Aa][Nn][Yy] ;
AS : [Aa][Ss] ;
BASE : [Bb][Aa][Ss][Ee] ;
CALL : [Cc][Aa][Ll][Ll] ;
CASE : [Cc][Aa][Ss][Ee] ;
COM : [Cc][Oo][Mm] ;
COMMON : [Cc][Oo][Mm][Mm][Oo][Nn] ;
CONST : [Cc][Oo][Nn][Ss][Tt] ;
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
FOR : [Ff][Oo][Rr] ;
FN : [Ff][Nn] ;
FUNCTION : [Ff][Uu][Nn][Cc][Tt][Ii][Oo][Nn] ;
GOSUB : [Gg][Oo][Ss][Uu][Bb] ;
GOTO : [Gg][Oo][Tt][Oo] ;
IF : [Ii][Ff] ;
IMP : [Ii][Mm][Pp] ;
IS : [Ii][Ss] ;
INTEGER : [Ii][Nn][Tt][Ee][Gg][Ee][Rr] ;
KEY : [Kk][Ee][Yy] ;
LET : [Ll][Ee][Tt] ;
LIST : [Ll][Ii][Ss][Tt] ;
LONG : [Ll][Oo][Nn][Gg] ;
LOOP : [Ll][Oo][Oo][Pp] ;
MOD : [Mm][Oo][Dd] ;
NEXT : [Nn][Ee][Xx][Tt] ;
NOT : [Nn][Oo][Tt] ;
OPTION : [Oo][Pp][Tt][Ii][Oo][Nn] ;
OFF : [Oo][Ff][Ff] ;
OR : [Oo][Rr] ;
ON : [Oo][Nn] ;
PEN : [Pp][Ee][Nn] ;
PLAY : [Pp][Ll][Aa][Yy] ;
PRINT : [Pp][Rr][Ii][Nn][Tt] ;
REDIM : [Rr][Ee][Dd][Ii][Mm] ;
REM : [Rr][Ee][Mm] ;
RESUME : [Rr][Ee][Ss][Uu][Mm][Ee] ;
RETURN : [Rr][Ee][Tt][Uu][Rr][Nn] ;
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
UNTIL : [Uu][Nn][Tt][Ii][Ll] ;
USING : [Uu][Ss][Ii][Nn][Gg] ;
WEND : [Ww][Ee][Nn][Dd] ;
WHILE : [Ww][Hh][Ii][Ll][Ee] ;
XOR : [Xx][Oo][Rr] ;

// IDs prefixed with FN are special cased as user-defined functions and not
// allowed in many places where IDs are allowed.
FNID : [Ff][Nn][A-Za-z][A-Za-z0-9.]* ;
// ID matches identifier names not starting with FN.
ID : [A-EG-Za-eg-z][A-Za-z0-9.]*
   | [Ff][A-MO-Za-mo-z][A-Za-z0-9.]*
   | [Ff]
   ;

NL : '\r'? '\n' ;
// Note: We skip ' comments here, but REM comments are parsed as statements.
// Don't actually consume NL because it's needed to parse statement ' NL statement.
COMMENT : '\'' ~[\r\n]* -> skip;
WS : [ \t]+ -> skip ;
