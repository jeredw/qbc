// Based on MS-DOS QBasic 1.1
grammar qbasic;

program: line* EOF ;

// Lines have an optional label, then one or more : separated statements.
line
  : line_label? statement (':' statement)* NL
// An IF block must be the first statement on a line.
  | line_label? if_block  // line ends in if_block
  ;

line_label
  : (line_number | text_label ':') ;

statement
  : rem_statement
  | assignment_statement
  | const_statement
  | deftype_statement
  | dim_statement
  | do_loop_statement
  | for_next_statement
  | goto_statement
  | if_inline_statement
  | lifetime_statement
  | print_statement
  | print_using_statement
// TYPE .. END TYPE is strangely not a block statement, it just consumes
// multiple lines.
  | type_statement
  | while_wend_statement
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

// Const expressions have bizarre 
const_statement
  : CONST const_assignment (',' const_assignment)*
  ;

// Constants can have sigils, but they're not part of the name.
const_assignment
  : variable '=' const_expr
  ;

// TODO: Only a limited subset of expressions are supported here.
const_expr : expr ;

// COMMON, SHARED, and STATIC declare variable lifetimes using the same syntax.
lifetime_statement
  : COMMON SHARED? decl_variable (',' decl_variable)*
  | SHARED decl_variable (',' decl_variable)*
  | STATIC decl_variable (',' decl_variable)*
  ;

decl_variable
  : ID decl_array_bounds? AS type_name
  | variable decl_array_bounds?
  ;

// The IDE erases a number of dimensions in array bounds.
decl_array_bounds
  : '(' DIGITS? ')'
  ;

// DEFtype typing is a leftover from a previous MS BASIC.
deftype_statement
  : DEFINT letter_range (',' letter_range)*
  | DEFLNG letter_range (',' letter_range)*
  | DEFSNG letter_range (',' letter_range)*
  | DEFDBL letter_range (',' letter_range)*
  | DEFSTR letter_range (',' letter_range)*
  ;

// Supporting ranges like A-Z in the lexer is messy since that's also an
// expression.  The IDE allows any ID-ID in ranges and strips down to the first
// letter, so we'll parse that and deal with it later.
letter_range: ID | ID '-' ID ;

// DIM can take a mix of "as" types and names with sigils.
dim_statement
  : DIM SHARED? dim_variable (',' dim_variable)*
  | REDIM SHARED? dim_variable (',' dim_variable)*
  ;

dim_variable
// Variables of user defined types cannot have names containing '.'.
  : ID dim_array_bounds? AS type_name
  | variable dim_array_bounds?
  ;

dim_array_bounds
  : '(' dim_subscript (',' dim_subscript)* ')'
  ;

// expr must be some kind of vaguely integer type expression.
dim_subscript
  : (lower=expr TO)? upper=expr
  ;

// A system or user-defined type following an AS keyword.
type_name
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING
  | STRING '*' DIGITS
  | ID
  ;

// Can't use variable-length strings in user-defined types.
restricted_type_name
  : INTEGER
  | LONG
  | SINGLE
  | DOUBLE
  | STRING '*' DIGITS
  | ID
  ;

// A DO..LOOP statement can start anywhere but must match LOOP.
do_loop_statement
// The loop can end on the same line it started on...
  : DO do_condition (':' do_body_statement)* (':' LOOP)
  | DO (':' do_body_statement)* (':' LOOP do_condition?)
// Or the loop can end on a different line.
  | DO do_condition (':' do_body_statement)* NL do_body_line* loop_line
  | DO (':' do_body_statement)* NL do_body_line* loop_condition_line
  ;

do_condition
  : (WHILE expr | UNTIL expr)
  ;

// Allow EXIT DO inside DO loops.
do_body_statement
  : statement
  | EXIT DO
  ;

do_body_line
  : line_label? do_body_statement (':' do_body_statement)* NL
  | line_label? if_block  // line ends in if_block
  ;

// These rules terminate a DO loop.  An implicit NL is matched by the line that
// contained the original do_loop_statement.
// TODO: Make this less confusing somehow?
loop_line
  : line_label? LOOP (':' statement)*
  | line_label? do_body_statement (':' do_body_statement)* (':' LOOP) (':' statement)*
  ;
loop_condition_line
  : line_label? LOOP do_condition? (':' statement)*
  | line_label? do_body_statement (':' do_body_statement)* (':' LOOP do_condition?) (':' statement)*
  ;

// FOR..NEXT is a totally reasonable for loop, except that multiple NEXTs can
// be combined into one statement using the syntax NEXT v1, v2, ... vN.
// TODO: Figure out how to parse NEXT v1, v2, ... vN.
for_next_statement
// Single line loop.
  : for_assignment (':' for_body_statement)* ':' NEXT variable?
  | for_assignment (':' for_body_statement)* NL for_body_line* next_line
  ;

for_assignment
  : FOR variable '=' expr TO expr (STEP expr)?
  ;

// Allow EXIT FOR inside FOR..NEXT.
for_body_statement
  : statement
  | EXIT FOR
  ;

for_body_line
  : line_label? for_body_statement (':' for_body_statement)* NL
  | line_label? if_block  // line ends in if_block
  ;

// The final NL is implicitly in the line rule that has the for_next_statement.
next_line
  : line_label? NEXT variable?
  | line_label? for_body_statement (':' for_body_statement)* (':' NEXT variable?) (':' statement)*
  ;

// GOTO can't jump into or out of subroutines.
goto_statement
  : GOTO (line_number | text_label)
  ;

// Labels or line numbers must be distinct.
line_number : DIGITS ;
text_label : ID ;

// IF has a concise inline form that can occur anywhere.
// The ELSE binds to the innermost IF.
if_inline_statement
  : IF expr THEN if_inline_action (ELSE if_inline_action)?
  ;

if_inline_action
  : statement (':' statement)*
  | line_number  // Implicit GOTO
  ;

// The lines inside an IF block are all normal labeled lines, and they can
// also nest other statement blocks.
if_block
// Must have NL after THEN since otherwise this is if_inline_statement.
  : IF expr THEN NL line*
    (elseif_line line*)*
    (else_line line*)?
    end_if_line
  ;

// ELSEIF .. THEN can have statements immediately following THEN.
elseif_line
  : line_label? ELSEIF expr THEN (NL | statement (':' statement)* NL)
  ;

// ELSE can have statements immediately following.
else_line
  : line_label? ELSE (NL | statement (':' statement)* NL)
  ;

// END IF can have more statements after it.
end_if_line
  : line_label? END IF (':' statement)* NL
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

// User defined types must contain at least one member.
// TODO: type cannot occur in procedure or DEF FN.
type_statement
// Note: type names cannot include '.'.
   : TYPE ID NL+ type_member+ END TYPE
   ;

// Type members can't have labels etc. like normal lines.
type_member
// Note: type members cannot include '.'.
   : ID AS restricted_type_name NL+
// Since we handle REM comments as statements, need to accept them here.
   | rem_statement NL
   ;

// Loop construct from an older BASIC?
while_wend_statement
  : WHILE expr (':' statement)* WEND
  | WHILE expr (':' statement)* NL line* wend_line
  ;

// This rule terminates a WHILE loop.  An implicit NL is matched by the line that
// contained the original while_wend_statement.
// TODO: Make this less confusing somehow?
wend_line
  : line_label? WEND (':' statement)*
  | line_label? statement (':' statement)* (':' WEND) (':' statement)*
  ;

expr
  : literal
  | variable
  ;

// Variables can have type sigils appended.
// No space is allowed before a sigil, but it's easier to permit it and check later.
//
// Variable names can contain '.', which is also used to access fields in user
// defined types. This creates an interesting ambiguity.
//
// TYPE record
// member AS INTEGER
// END TYPE
// DIM example AS record
// example.member = 42
// 'example.huh = 50 ' Error: Element not defined
// some.variable = 50 ' This is ok.
// 'DIM example.tricky AS record ' Error: Identifier cannot include period
//
// Field lookup is not part of this grammar at all, and will be handled in
// symbol tables instead.
variable : ID ('!' | '#' | '$' | '%' | '&')? ;

literal
// If a floating point constant isn't explicitly marked as single or double and
// is representable in single precision, it will be single precision, otherwise
// double precision.
  : '-'? PROBABLY_SINGLE_PRECISION_NUMBER
  | '-'? DOUBLE_PRECISION_NUMBER
// The IDE has all kinds of behavior for integer constants.
// - Erases trailing %
// - Rejects out of range values as 'Illegal number'.
// - Strips whitespace between '-' and a number.
// - Strips unary '+' from expressions in general, not just numbers, so no
//   need to handle that here.
// - Strips leading zeros, so accept those.
  | ('-'? DIGITS | HEX | OCTAL) ('%' | '&')?
  | STRING_LITERAL
  ;

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
AS : [Aa][Ss] ;
COMMON : [Cc][Oo][Mm][Mm][Oo][Nn] ;
CONST : [Cc][Oo][Nn][Ss][Tt] ;
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
EXIT : [Ee][Xx][Ii][Tt] ;
FOR : [Ff][Oo][Rr] ;
GOTO : [Gg][Oo][Tt][Oo] ;
IF : [Ii][Ff] ;
INTEGER : [Ii][Nn][Tt][Ee][Gg][Ee][Rr] ;
LET : [Ll][Ee][Tt] ;
LONG : [Ll][Oo][Nn][Gg] ;
LOOP : [Ll][Oo][Oo][Pp] ;
NEXT : [Nn][Ee][Xx][Tt] ;
PRINT : [Pp][Rr][Ii][Nn][Tt] ;
REDIM : [Rr][Ee][Dd][Ii][Mm] ;
REM : [Rr][Ee][Mm] ;
SHARED : [Ss][Hh][Aa][Rr][Ee][Dd] ;
SINGLE : [Ss][Ii][Nn][Gg][Ll][Ee] ;
STATIC : [Ss][Tt][Aa][Tt][Ii][Cc] ;
STEP : [Ss][Tt][Ee][Pp] ;
STRING : [Ss][Tt][Rr][Ii][Nn][Gg] ;
THEN : [Tt][Hh][Ee][Nn] ;
TO : [Tt][Oo] ;
TYPE : [Tt][Yy][Pp][Ee] ;
UNTIL : [Uu][Nn][Tt][Ii][Ll] ;
USING : [Uu][Ss][Ii][Nn][Gg] ;
WEND : [Ww][Ee][Nn][Dd] ;
WHILE : [Ww][Hh][Ii][Ll][Ee] ;

// Note ID has lower precedence than keywords
ID : [A-Za-z][A-Za-z0-9.]* ;

NL : '\r'? '\n' ;
// Note: We skip ' comments here, but REM comments are parsed as statements.
COMMENT : '\'' ~[\r\n]* '\r'? '\n' -> skip;
WS : [ \t]+ -> skip ;