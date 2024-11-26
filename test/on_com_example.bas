    COM(1) ON       'Enable event trapping on port 1.
    ON COM(1) GOSUB ComHandler
    DO : LOOP WHILE INKEY$ = ""
    COM(1) OFF
    END

    ComHandler:
        PRINT "Something was typed at the terminal attached to COM1."
        RETURN
