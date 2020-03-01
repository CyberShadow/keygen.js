TMP=tmp

BROWSERS= \
	2016.01.01-chromium \
	2020.01.01-chromium \

all : jshint \
	$(addprefix browser-, $(BROWSERS))

browser-% :
	x=$* ; make -f GNUmakefile.browser ARCH_DATE=$${x%%-*} BROWSER=$${x#*-} TMP=$(TMP)

FLAG_JSHINT=$(TMP)/.ok-jshint
jshint : $(FLAG_JSHINT)
$(FLAG_JSHINT) : ../keygen.js
	npm run jshint ../keygen.js
	mkdir -p $(TMP)
	touch $@


MAKEFLAGS += --no-builtin-rules
.SUFFIXES:
