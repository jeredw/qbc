'   Note: The IOCTL$ function works only if the device driver is
'         installed and states that it processes IOCTL strings, and
'         if BASIC performs an OPEN statement on the device. Do not
'         run this example in its current form.
'
OPEN "\DEV\ENGINE" FOR OUTPUT AS #1
IOCTL #1, "RAW"                   'Tells the device that the data is raw.
'
' If the character driver "ENGINE" responds "false" from
' the raw data mode in the IOCTL statement, then the file
' is closed.
'
IF IOCTL$(1) = "0" THEN CLOSE 1
