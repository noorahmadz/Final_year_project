"""Project apps package.

This file ensures `apps.*` is a regular package (not a namespace package),
which keeps Django/unittest test discovery stable for labels like `manage.py test apps.users`.
"""

