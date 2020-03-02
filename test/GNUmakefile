# Copyright 2020 Vladimir Panteleev
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

TMP=tmp

BROWSERS= \
	2016.01.01-chromium \
	2020.01.01-chromium \
	2018.01.01-firefox \
	2020.01.01-firefox \

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
