import Fuse from "fuse.js";
import { Environment } from "../../../../util/types/worker";
import type GuiWindow from "../../lib-gui/lib-gui";
import {
	WindowBox,
	WindowContentItem,
	WindowImage,
	WindowText
} from "../types/windowContents";
import WindowManager, { PaletteIndex } from "../windows";
import { AppMetadata, getAppMetadata } from "../../../../util/lib/appMetadata";
import { flatPromiseMap } from "../../../../util/lib/arrays";
import include from "../../../../util/lib/include";

// @app-name: Search
// @app-icon: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAJypJREFUeAHt3c2TndV9J/Bzu9XqRi+0BEgCbEBOmZlUDa6QshdTeBHsbGJCkmZWZAVUBaaysvMX2OxSs4m9SgWnCljZq6FTwTib2PKCrHBFU6ZqXIPLCITBkgCpJdR0q1/uPL/buiCEXvrl3vOce8/nU3XdkixQo3Pv8/ue3znPeTppDM09P3c0rS0/mNYmjqaJdF/qpAOpm46mbvfoxu/oHE0A8InuidTpnGt+cK6pFeeaH59I6+mtNNE5nrrr5+afeeV4GjOdNOJ6xX7l0sPNYP1R89OHU7dztBnIAwkABqYJB51uhIDjqbP+izQ5fXz+qfkTaYSNXABoCv6BtLr6YFPk/6pJaXNm8wC0ohNhoHl1Oy/OP/3ysTRiRiYAzP3w0WaW330irXfmzPABKEvTIZjozqe0/i/zf/PT+TQCig4Ac8898mDzHTYz/YnvKPoAjIgTaSIdS5NTz5a8TFBkAOjN9lP3u6nbrOkDwKjqNEEgdZ4tcYmgqACg8AMwpk409e3Z+WdeeSEVoogAoPADUIkTpQSBVgPA3D/OHU27Vp5X+AGoS3c+Te3+uzb3CLQSADZu5bv07dTtfC8BQK063e+lXbt/0ASBcymz7AGg1+7vdp9vfng0AQBxCuFTuTcKZgsAG7P+lVjn/04CAD6rk74///RP/i5lkiUA9Nb6J1d+nsz6AeBGTqSpqW/k2BswkYbssX/+8yfS5Op/JsUfAG7maFpZ+c+5f/rW0Lvlk2mI5n745//QtPz/vvnhTAIANmMmdTp/9od/eX/69b++8Ys0JENZAuit96+sPp9SPKwHANie3u2CTw3jLoGBB4DL6/0vNT98MAEAOzWUfQEDDQA2+wHAUAw8BAwsACj+ADBUAw0BAwkAij8AZDGwELDjAKD4A0BWAwkBOwoAG7v9V9zjDwA5ddLxtKsXArZ9d8DODgLq3eqn+ANAVt30YFq59HzagW0HgLkfPvJd9/kDQFs6c70D97b7T6dtmHvu0W83xf/7CQBoVWciPfnS3/zkxbRFWw4AG5v+4mz/7oEEALTtXJqa+uOtbgrc+hJAb8e/4g8AhYgN+T/vbczfgi0FgMtrDUcTAFCSo2l15btb+Qc2vQQw98NHH07d7s8TAFCmTucb80+/fGxTv3Uzv8n9/gAwEk5c3g9w0/MBNrcEsHrp20nxB4DSHU2XVr+zmd940w7A5aN+30wAwGiYmvrSze4K2JVuZnJ124cMlGDl/GpafHspLZ1eTisLq73X2vJ683UlAcDU7FSanJ5ovu5KM4d3N6/pNN18jZ+PrNWVOCXwGzf6LTfsAMw998iTzW/Z0VGDbVg8uZQuvHGxeS0q9ABsSwSAPffekg48sD/tuWcmjZybbAi8SbzpbOmWgjatN7P6D15bSB/+ciGtL60nANiJ6Bgv/OpC7xVh4NDXDzZB4JYR6gx0o4Yfu97/e90OwKjM/hV+AHKZmJlIs01H4Pavzo5GELhBF+AG3335s/8o+mdePavwA5BF1JuzzaTzo2aZOToCEQbKdv0uwDU7AKUf+hNtmXd/eiYtvv1xAoC2RBfgvsfvLrsbcJ0uwHXOAegWO/uPWf9vX3xH8QegdTEhffOFd9KHTVegXNeu6Z/rAJR83/+pn31Q+F8yALW6o1kSiGWBMnX/eP6ZV45f+Suf7wBMrhQ5+3/3lTOKPwDFev/Vs73l6SJ1J+au/qVrLQE8nArz5gu/SwuvX0gAULK4ZTBqVnE63W9f/UufCQBz//wXkRCOpoLEzD9O8QOAURA1q8BOwIHeBv8rfLYDsL7+V6kg0U4x8wdg1EQn4Pc/+yAVpdN94sqfXrUE0JlLhejf4w8AoyjOCyhq79p6mpt7fu5A/6efBICN1kD3QCpA3Fah+AMw6qKTHTWtEAfS6uqD/Z982gHofrY10Ka3fvye0/0AGHnx9Nmi9gN01z/p9H8aADqdB1MBFl7/yBP8ABgbcXBdOUsBnU/2+vUCQO/wn2639QCg9Q/AOIqlgHh4XQGOzj3f1PzU7wBMrRUx+4+Nf2b/AIybtctPri3CytrD8WUjAKx3H04ti9n/Obf8ATCm4q6AMroAG5P+jQDQ6f5RatniySUb/wAYW+V0ATp/Ev+7EQC67W8AtPYPwLg7W8YywNH4n4m55+YebPv+/5j9W/sHYNxFFyBqXssOxEbAidRZbf3wH2v/ANTiwhsXU+suLT84kdbbv/1v8e3W0xAAZFFEAEgT0QHoHE0tit3/2v8A1GKj7rV8PHCnezQ2Ad6XWrR0xqN+AajL4smPU6smOrNNB6DdDYDLpy4lAKjJ0umWa1+3Ex2ATqsBYOmMAABAXVpfAujGEkC33Q6A9X8AanOpgEcExx6Ao6lFa0vdBAA1WV9eSy07OpFapgMAQG1aXwJI/aOAAYCqCAAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqtCtRpanZqTRzeHfaPbsr7Wpek9OTza/t6r3C5PREmpj+fD5cX15Pa/FaWv/kxysLK2l1YTUtnb7U+/nSqeXEaJiYmUi3HJ7uvRemm6/x8/hxmLr185eHlfOrn4z90unlT8b94+bH682vUxbjy40IABWID/3ee25Je+6daT78GxeDaxX3Tf27LgeDqVuv/3s2Lh6XeheQxbeX0sWTH7t4FCTC34EH9jXvh+Y9cc/M1v7Zpmj0x/7qfzbGfLEZ64/eWEwX3/440Y69l8d10OO7eHKp95leeP0jIX9MCABjaicX+Z2KgNC7ADWv27462/u1uHh89MbFdL4pDtExGEeHvn4w3dG8hmWlmY395p/eTtu1//696bavzQ7t/RDBMl4x5vG9XvjNxfTha+fHZrzvfuRQmn1gfxqW+Iy89aN303ZEyD/YfG/7mjEe1vhe+ZmO8X3/1bNNuF8a289zDQSAMZLjIrBd/YvH4W/e3rvQLfzqQjr3+oXE8B1o3hMRTPrLOznEnxWFIl4xYzzTFAuFYjgi1EX43G5XbztifO9qAlEwvqNLABgDvYttcxGIC33Oi8B29cNAFKUIAy4ewxHLPUf+9PbWw+Bs04mKl0IxWNHqj0DdX9NvS398z/5yIX0wRh2fGggAIywKfyT/YbYlhym+/9nZjYtHtBPPNQXCxWMwIhAeaYpDSWKcI4xsjLXuz07E2MYYl+Rg0+3Z9+W9xneECAAjKFr9hx46WNwFYCfuuBxkXDx2Jt4bdzbFodRQ2G8dx94U3YCti/G957E7i1vi6+uP78yR3el0M742/5ZNABgxsZErNiONQqt/qxSHnYnicN/jd7feEt6MfjfgrR+/Z5w3KT4fMb4593JsV78bYHzL5iCgEdFP/l987MhYFv8rRXG47/G7emGHzRml4t8XhexLT36hmS1OJ25slIp/38b3fFfvjiTKJACMgNjM9QdPfDHtu39PqkVcPCLsHBribXXjZNSKf18cOHVvUySEgOvrh7tRKv59Ql7ZBIDCxVrufX9910h++Ach9gbc+adlbWYrzZECdoLvhBBwY7GnY5Q//8a3XAJAwaL4jet6/1bEeuJ9f313bybEZ8Wtn+OwGbRfJLSLPyvGdlTv8rlSjO8X544Y38K4ohYqir/296diw1i0QYWAT8Ws8I4xeo9EkbBm/Kn+bb7jor8nwGe4HEaiQIr/tUWb+85v3pHYcCjz6X45xH/P3ZdPmKtd7tP9cojx9RkuhwBQmP6xnlxb3CFgT8DlQ5TGoDV8Lb3z5sfojIvtGOfxjc9w7eNbCgGgIL2jWws7va1EsSeg9gvIuIfE3sbGijeNjfv4bjybwlJP2wSAQvRve2Nzar6AjPPs8Eq1huEaxjf2e1jqaZ8AUIhxXM8dppovIHvvuSXVIJYCDlQQdK5WywFYMb7xQCPaIwAUIC5yNczoBq3WteLZr9TzXolOT227xg/8t7rGl/YIAC0bt1u5cqutQETno9QHwQxDfD5u/2o9IS/+e6ePjO6hTlulC9AuPeeWldb6Xzm/mlYWNl5Xi+8zClB8LeX2pPh+okDEw4NqMF3hxrjojtUyvrERuDYR4i++/XEiPwGgRW1v9llfXk9Lpy+lC29cTItvL6VL51c2/fjOuFDFTOXWL+9Ne+6daTUQHGyWAT745UIVjx7du8PZf4x5hLsY96v1A950YccKx/cVs8QaisROuzsR4ONzcPX4xrhGp6zE8e13AYSA/ASAFrV1q08UgA+bgnnu9QvbLppLp5d7r4VfXehdWGLj0qGH2ulmxEUt9lF8+NpCGnfTW5whRsGPcY6Ad/Hkx5se73gkcxy8FONawpJDLbPErd76OC7jGyFeAMhPAGjJxlpu3rWvKPxn/uNsr2gPUlx04t8Zr/ggH27hBLO4kI17AIhwtdmAFTPACHnR3dlOyFtsLsbxir/T/pG0bXarokhF0BznLs9WCvHiyaXessjiNoum8SUIAC2JgpVzthzFIC4Yw/6AnW0uKB81RSf340vjAhLnAqwsrKSaxYwwxnmQYSiC47uvnOn9e9ssFLV0eW4kxvf3P/tgoCG+hPGtqYtXEncBtCTnrVynmgvGqX//IFu6jgvKmy+80wSBxZTT/vv3pJrFrP+3L/xuaBfRfqF496dneoUot1ruj7+emPXH+A66g9fXH98IGG2ofXzbIAC0IGbGudbdovi3karXmgJx8qXfZw0BNV9AFpp14Ld+/G6WDkgUoN82Ae9ad4oMU79NXKPe+P4oz/hGF+/NJmjkDnmxOdGTAvPyt92CXCe5vT/gVvB2vPvK6WyFotYLSISsmLnlXD+NMY3AkbtIxF0ntYniH+ObU2zwfetH72Ud31gGuKXC2yDbJAC0YF+GmWpvw18B905HJyBaxjnUeAGJcf7dT0+nNsSfffKlUymnmg7JCbGsk7v4f/pnL2f/s2s65KoEAkAL9t47/Df5Wz9+L5UidhvHLCaH0u5xHrYY5zZ3TsfY5gyatTwHIUTAeidzwLpa3EWSs4u4x6mAWQkAmcV93MO+RS42C5W2G/7c6x+lHGo6SS2WeEoY51gztswzeHHLbgnjG++zXEsBtQX4tgkAme3OcGvcuUyz7a3o3XfcBJNhm5jppBqUssQTYpknilUuuws6OntYYnyHtdt/q2J8P8jUBdg4arzOx3y3QQDIbCZDwo22XYlynPQ1c6iODkDOgrsZUaxyzRJrGOPSxje6PNnGt7J9Hm0SADIb9uE4y6cvFXua1vI1zp8ftFraw3H0a2lyzRJLenjWMJQ0+++LLsC5TN/T1K3Op8vF33RmvYNUWtrV27bYVTxsk4U8pXCYLvzmYpEnHsZGzxzPtxj3FnGOpbLtuPCbxXTb14b/aOZxD3gl0QEgm1wbxca9QFzIfMLiZl3vMdKDNu77PCLglSj28eRYBpicnkzkIQCQVe7T48ZRie3/vsWT9nnsVMlPxbuY4b2nA5CPAAAjJNZiS37g0VKGfR7jrOQ9PCHHe88egHwEABghy4UX2DxLAON72bp0vuynWZb+/mNrBAAYIaUvodjouTOlj+/HAsBYEQBghJTc/g8lt69HQel/f+vLa2nY7AHIRwAABmZtWQDYCZtkyUkAAGBTBJTxIgAAQIUEAACokAAAABUSAACgQu63GDNxSMru2aneY4fjfulds7t6Z2vHrTX922vi1ycqeGgOANcnAIy4ePDNrffvSdOHp9Oee2ccownApqgWI2jvvbekfU3RP/DAfjN5ALZFABgRij4AgyQAFC4K/x1fP5j23DOTAGBQBIBCKfwADJMAUJjYxX/ooYPptq/NJgAYFgGgIDHrv+tbhzwNC4ChU2kKEe3+Q80LAHIQAFoWLf87v3l7mn1gfwKAXASAFkXxv+/xu3un9gFATm4ob5HiD0BbBICWHGna/oo/AG0RAFoQG/7c5gdAmwSAzOIWP7v9AWibTYCZxbp/m1bOr6bFt5fS2vJaWllYTevL6ymnWPrwLAOA9gkAGUXrv41DfhZPLqULb1xM516/kNaX8hb8q93x0EEBAKAAAkAmbbT+o/CfefVsM+P/OAHAlQSATHIX/1M/+yB9+NpCAoBrEQAyiNn/nntuSTnEmv7Jl06Z9QNwQwJABnub4p9r7f+tH72Xlk4vJwC4EbuxMpj9Sp5z/qPtr/gDsBkCwJBttP9n0rAtvP6RNX8ANk0AGLK9mdb+Y7c/AGyWADBk++7fm4YtZv8rCysJADZLABiyHA/8WXj9QgIYtjYOMmN4BIAhmpyeGPoHZm15PV10y181JmbK/shOOuVxRxTYjWsaefi0DtH0kek0bIsnFf+aTE5PppLtmp1KbF/pAW8qw/i2fVx5TQSAIdp96/DT/PKpS4l65FhS2onJDAVsnGeIpXcAdHjGi9Ecohwf5niiH/XYVXiByBFQxnmGOHNo+F3DncgxvvHEUvIQAIbIU+8+b7LwFmfpNvaVlNtmVyB2JiYNJS8D7Lk3z23N5OFqPESK3WdF8RKKdm5vhoOltivXMy/G2S2Hy+0CZAl4uprZuBqTTY5NkTUodRYWs9ccy17jftz1vvv3pBLF+y5HgHemST4CANmUvoFtVESBKLFNvD/DoVdh3GeIsw/keXbIVh14YF/KQQcgHwFgxE0fGZ2imqtAjLtYSjlQYJG47auzKYdx3yQW47u3wC5PruUdmwDzEQBG3EzB64VXyvVQpFrkKrabFYEk1y1sNbSI7/j6wVSSnOP7sSeaZiMAjLjpEWmrHyrsgjbq4mJ829fKCQG5ClacAbBUwdkXEZZL6QLEey3X+C6fvuQgoIwEgCHKsZZVarvwSnEBKXVdc5TFRbmEWwI3vo88s8MoELW461uHitjrEd2mXON76bwNgDkJAEOU68SygwXNBK/F7H84Ivzd/cih1KZYgso5vosVPfciiu6d37wjtSla/zk7TYtvLyXyEQCGKNdu1v1f3lPs4TBx8TD7H55oFd/5p7enNkSB+uJjR1JOiyfrKhCzD+xrLUBHuDuS+b3l2SZ5CQBDlPN+5bZngtfSu4B8s53iVJODTYs2d5GI4n/f43dnPbu+1idfxhJL7vGNz+59f31X1oO7YsJUw/6OkggAQxRv6PVMywAxEyxpU1j/AkIeUSS++D/uzNIJits5/+DJL2Z/cE3Ns8MY3+j05NgTENeR3MU/1NbdKYGHTw/Z0ulL2W5/i4tEfIiWTrV7G020/HsXK8f+ZhVLQTOHdqf3Xz2bzr1+IQ1aFJ87m45OW0s6F95YTDWLTs++L+9Np3/2QTr/xsU0aBHo7n7kcGu36y4M4T3LjQkAQxbFONcHKjaF3fv4XentH7/XSgiIAnHooYNFdSJqExfxu5rloNmv7E8fvrbQFM2dF4oY19ub4hPj2laoi/b/hSEUvVET4/uFx46kg03Qj6A3iCWR6NbNfmVfb8NfW+Mb3dIal3faJgAM2YXfLGYtiBECvvTEF3oXhzPNK5e4FTFuWyr9eeajbOH1j5r/7W5qBh6hM15xYY2uUBTPi00LfTP3WEfB390sJcRDh/Y17f4SDnD6qJn9j/v94TG+mz0wK35PhP0Y3wu/udj7+4kDdDY7vvHAod57pPncljC+2v/tcLUesrhtKfYB5E7WsRwQheK9n54ZarKOwh9/1mYvInHBEhK2L5aUthIne2cwzO7r7SYP8V6Mf0fMqK8uFv2H+UzdWt74fPjLc6kGW+0Y9g6Eiu7M5ZMh4xjd+IyN2vjmnKzwKVfiDM796kIrbfH4sMcsIdL1QvM9nG9mCoOYRcUM4mATLrYzO3z/P872OgVsXYznTtf2I4iO2pHMG/ta6tgdvtODjqK4l1jgbyQ6H54A2A4BIIPcywBX67eD70qHehfTj5p2cMwCLy2s3vSD128Hx5P84tjheCDITp7q97HbfHZk+VR956Sfq2hzWCzVxOe0Jjb/tUcAyCCWAaLwljDz6oeBK/WfvtU/uKjfoo/9BINcuoi/g/XltcT2RWu3lPdSDvGejO5VDSZmOtWNb0yObP5rj/u0Mil5javfNuyHg/7PB71voaaZ3DBMXh6PmnbDn/rZB6kWk9OTva81FcRT/17P+JZIAMik3wWomXO+d6YfyGJGnOuAqTbF2nCNt/6dfW0h1cDaf/sEgIxq3unqwz44NdwTHwGn1s9LfxlgnMXSjp3/7RMAMoouwIeVpPur+bAP1rnemQDjK94vtQXGK3fvj/vn5cx/1De+JRIAMnu/d2HL85TAUrxf4cV82CJMjuvu6TjUptag3DfOS4bRDaxlY2fpBIDMor33zkunqljDDVp9g3P1AUrx9zpu76N4v/y+oo1/N/LuK6fTuNkY3/cTZRAAWhCPCa7lIvfWj99LDEdcTE+PUbiKMBPvF92iDeMWnuO/J8Z33I90HiUCQEuiBTbuM+O4hcvFfLhix/i4tIrf+lHdxf9aj/qN5bNxGN/1y51P14OyCAAtyv3Anpziv632ddxc3vnfvx/pfSVRHN595UyvM1azyeucuxFLAaM+vhHuah/fEgkALYtCOW7LAeMcbNo2NTv1uV9b67XO3x3JItEvDo6Dvb6N1vm7I7nfo/e9K/7FEgAKEG3cN1/43cjfHdCfySn++fWLxCi9h+J7/W3zvlccbq5fSEdtfGPN3/iWSwAoRHxI4gI+qjOh/sXcTK49oxQC4la/3774jjXhq1xrH0Bf/xoxCuP74S8XjO8IEAAKEh/smEG/+9MzI5X0Y8bvw16GeN+8+cI7xe6/iC5RbA49+dLv7Qa/hv7zAK6nP76lBu0Y35Mvneqd8W98y+dpgAWKOwTiIJDZB/anA83r6vu/SxG7kyOwKPz57G7eCzf7+167XGSXzlxKhx46WMz7J2aFvbMLFIYdWbu81Hax+fyVNL4xtjHGxnd0CACFiqQfm+ki6e+/f2+67auzxXzQo/DHh33RYzyLFkEyXnd8/WCrQTJOfqvxaN9hK2GiEDP+eMrnh6+dN74jSAAoXASBaOfGK4JAfND33b8n5bZyfjWday44Ev7oiSAZr9mv7M82Y4zC8EG8b71ftmRyptN85jf/+6+cKOy595Zs4+t6MB4EgBEST4DrPwUuwsCee2fS3ntuSdOHd6dBiwv40ulLvT8vHuM7qJ28ccH6v//rt4n8+h2BmcPTTRjY1/u6556ZNCjRGYr3yYU3FnWHtulmewCuJz5X/fGNILC/mSQM+toQ43vx8jMKjO94EABG1JVhIMSHPg4SmWk+8HFhj93E8fP4euVTxvqiwK9dvq94+dSl3o+jhRfJ/mJT8LXzynStsdyqKNJL/74R6OL9Ee+XeN/EzDF+fKP3Tbw/QrxnLp1f6RWeCIrx7zQTLEPvQUKXC/SV4xtfY4yvN779a0KMY4yr8R1/AsCY6H/gx/058QxWXNSvLBiMF+PLjbgNEKAQNzoHAAbNuw2gEJO7XZLJx7sNRkipZ0IAo0cAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABXalYCBOPPq2d6L8fTuK2d6LxgXOgAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhQQAAKiQAAAAFRIAAKBCAgAAVEgAAIAKCQAAUCEBAAAqJAAAQIUEAACokAAAABUSAACgQgIAAFRIAACACgkAAFAhAQAAKiQAAECFBAAAqJAAAAAVEgAAoEICAABUSAAAgAoJAABQIQEAACokAABAhVoPAFOzUwkAajI1uyu1LQLAidSiyZlOAoCaTExPppad0AEAgMx2t98BODeROu12AKZubb8NAgA5zRzenVrV6TQBYD29lVo0c3g6AUBNptuufd31hYlIAalFe+6ZSQBQk9Y7AL09AN3uidSi2AlpHwAAtdioey0vf3c7TQCYnDiRWrb//j0JAGqw955bUusmOscn0srK8dSy/ffvTQBQg9mv7E+t666fm5j/2387kVL7+wAmZhxKCMB4i9Z/AXvfzs0/88rxjarb8q2A4favziYAGGeHvn4wta7T6XX+NwJAN/0itezg12Z1AQAYW5PTE83sv4D1/+76/4kvlyvueuv7AOIvRhcAgHEVa/8lPAMgdbvH4stGAFhbP5YKoAsAwDiKwn9bKZPc3d1PlwA2NgK2vw8gugCHS1gfAYABirX/Imb/KR2ff6pX8698HHDnX1IBDjYJae+9BayRAMAAROGffaCAW//CRDr+6Q/7Omk+FeKubx2yFADAyItadt/jd6didDsv9n/4aZXdtet42+cB9EVashQAwKg79FAxrf9wbv7pl4/1f/JJAJh/av5c6naLWAYIsRRw29fcFQDAaLqjmcgWVccmPtvp/2yffaLzQirIkW/eXsaRiQCwBbHmX8ShP1daW//MJL9z9f8/99yjZ5tFggOpIG+++Lu0dGo5AUDpZg5Ppy89+YVUmBPzz/zkS1f+wud32nXTD1JhvvTEF3QCAChezPwLLP5R7Y99/peu1lkv5m6AK939rUPltVMA4LJY77/7kUOpSJNrz179S51r/b65H/75z5tOwMOpQGd/uZBOv3o2rS+tJwBoW9zqF7v9i9243ukcm3/65W9c/cvXudm+82wqVNwd8AdPfDFNzU4lAGhTHFwXNanwu9auWdM71/vdJXcB+hZe/yidaboBKwsrCQByKX7W/6nPbf7ru8HpBNEF6D6cCjb7wL60556Z9GGzLHDu9QuWBQAYqij8t18+p2ZiehROrO1et6PfSTcwCl2AvpWF1bR4cklHAICBG73C33Pd2X+4yfmE5XcB+noPW5jd1+sKRBBY+NWFdLH5KgwAsB2x1+zW+/ekfffv7XWbR0/3hvv5btgBCKPUBbiW6AwsnbmUlk8tp6XTl9LK+dW01iwVCAYAhCj0k80Mf+rWXWl3M5mcPjyd9tw70/v56OrMzz/z8mM3+h03/69bXXsqTU6+mUZUdAbitf/LexIAVGFq9e9u9ltuupAx/7f/diJ1y70tEAC4QlOz559qavdNbG4nw+5d32/+90QCAEp24nLNvqlNBYDeo4I7nacSAFCuplb3avYmbPpehvmnXz7W/JuLe1AQABC6P9io1ZuztZsZp3Z9L1kKAIDSnJh/5pXvbOUf2FIA6LUV1ta+0XQCNtVeAACGranJU2vf2Oo/teXjjHp3BaT1m95eAABk0O1uatf/1SbTNvz6X984/od/8V8PNj/87wkAaEfc8vc/f/L3aRtuehLgjcw99+hLzZ8+lwCAzG5+2t+N7OyJBlO7nmoixPEEAOR0oleDd2BHAaC3KXB17bHkzgAAyOVEbPrb7P3+17OjJYC+uX/8s6NpcvLnzQ+PJgBgWC4X/61v+rvaQAJAEAIAYKgGVvzDwAJAEAIAYCgGWvzDzjYBXqV3RkDvoCB7AgBgQI4PuviHgQaA0AsBU1N/HLcnJABgB5paOjU18OLf+zenIZr7p0e/lzrd7yYAYIu6P9jq+f5bsa2TADfr1y//v2N/+Jf/ZaHJGXFi4EwCAG4inrcz8bfzz2zvhL9N/ykpA5sDAWBTTgxjvf9asgSAvrnnHv1+09L4dgIArtL9QZra/b2dHvCzWVkDQJj74aMPp273+aQbAADhROp0npp/+uVjKaOB3wVwM73/wLhLoNt5NgFAzaIWNjUxd/EP2TsAV9rYG7DrHzxREICqdDrH0q7Vp3Ks9V/3W0gFmHvukSebbyVuFzyaAGBcReFP6dk2ZvxXKyIA9AkCAIylggp/X1EBoK+3UTCl76Zu9+EEAKOqwMLfV2QA6OvtEZiY/F7zXf5J0hUAYCR0zqVu+kHqrM/PP/PK8VSoogPAleb++S/m0tr6XJOm/iql7oEEAMVoiv5EZ77pXL9Y4mz/WkYmAFypt0Sw3n2y+cv+o+Yv+8EEAPmdaCak/5I6E/Np167juQ7wGZSRDABX6i0TTE09mNbXHm4GoQkE6UEdAgAGq5nhd5qC313/Reo9nnf3sabgn0gjbOQDwLXMPffIg00YONB0CZqv3aMpTdzX/JdGKDjQdAzi69EEAJ860fvfTudE77W+tpC6zdfJieY1eXzUi/21/H+KqsKEGiociwAAAABJRU5ErkJggg==

export const paletteWidth = 500;
export const paletteHeight = 750;

const paletteSearchIdentifier = "paletteSearch";
export default class PaletteHandler {
	#guiLib?: GuiWindow;
	#searchTerm: string = "";

	constructor(
		public env: Environment,
		public windowSystem: WindowManager
	) {}

	async init() {
		const { default: GuiWindow } = await include(this.env, "lib-gui");

		this.#guiLib = new GuiWindow(this.env);
		await this.#guiLib.init("Search");

		this.#guiLib.onTextboxCompletion = (contents, reference) => {
			switch (reference) {
				case paletteSearchIdentifier:
					this.#searchTerm = contents;
					this.update();

					const top = this.#topResult;
					if (top?.directory) this.#handleTriggerEntry(top.directory);
					break;
			}
		};

		this.#guiLib.onTextboxValueChange = (contents, reference) => {
			switch (reference) {
				case paletteSearchIdentifier:
					this.#searchTerm = contents;
					this.update();
					break;
			}
		};

		this.#guiLib.onButtonPress = (reference) => {
			this.#handleTriggerEntry(reference);
		};

		this.#guiLib.onKeyPress = () => {};
	}

	#handleTriggerEntry(reference: string) {
		switch (reference) {
			case "gui://showHelp":
				this.windowSystem.showHelp?.();
				break;

			default:
				const entry = this.#indexCache?.find?.(
					(item) => item.directory == reference
				);

				if (!entry) return;

				this.env.execute(entry.directory);
		}

		this.windowSystem.hidePalette();
	}

	resetSearchQuery() {
		if (!this.#guiLib) return;

		this.#guiLib.setTextboxContents(paletteSearchIdentifier, "");
	}

	#indexCache?: PaletteIndex;
	#topResult?: PaletteIndex[0];
	#appMetadataCache: Record<string, AppMetadata | null | void> = {};
	async #appMetadata(directory: string) {
		const cacheValue = this.#appMetadataCache[directory];
		if (cacheValue || (cacheValue == null && cacheValue !== undefined)) {
			return this.#appMetadataCache[directory];
		}

		const metadata = await getAppMetadata(this.env, directory);

		if (metadata) {
			this.#appMetadataCache[directory] = metadata;
		} else {
			this.#appMetadataCache[directory] = null;
		}

		return metadata;
	}

	async update(idx?: PaletteIndex) {
		const items: WindowContentItem[] = [];

		const index = idx ?? this.#indexCache;
		if (!index) return;
		this.#indexCache = index;

		items.push({
			type: "textBox",
			message: "",
			backText: "Search Constellation",
			identifier: paletteSearchIdentifier,

			x: 5,
			y: 5
		});

		const lineHeight = 30;
		let y = 5;

		const searcher = new Fuse(
			[...index, { name: "Help", directory: "gui://showHelp" }],
			{
				keys: ["name", "directory"],
				isCaseSensitive: false,
				includeScore: true
			}
		);

		const results = searcher.search(this.#searchTerm);
		this.#topResult = results[0]?.item;

		const appPaletteEntry = async (
			y: number,
			item: { directory: string; name: string }
		) => {
			const metadata = await this.#appMetadata(item.directory);

			if (metadata?.["app-palette-show"] == "false") {
				return undefined;
			}

			const icon = metadata?.["app-icon"];
			const name = metadata?.["app-name"] ?? item?.name;

			return [
				{
					type: "box",
					x: 5,
					y: y - 5,
					width: (this.#guiLib?.dimensions.width ?? 100) - 10,
					height: lineHeight,

					identifier: item?.directory
				} as WindowBox,
				{
					type: "text",
					text: name,
					x: icon ? 35 : 5,
					y: y
				} as WindowText,
				icon
					? ({
							type: "image",
							x: 10,
							y: y - 1,
							width: 20,
							height: 20,
							sourceType: "url",
							source: icon
						} as WindowImage)
					: undefined
			].filter((item) => item !== undefined);
		};

		const baseY = y;
		if (this.#searchTerm.trim().length > 2) {
			items.push(
				...(await flatPromiseMap(
					results,
					async (result, i): Promise<WindowContentItem[] | void> => {
						const y = baseY + (i + 1) * lineHeight;

						return await appPaletteEntry(y, result.item);
					}
				))
			);
		} else {
			y += lineHeight * 3;

			const baseY = y;
			items.push(
				{
					type: "text",
					text: "Apps",
					x: 5,
					y: y - lineHeight,
					fontSize: 30
				},

				...(await flatPromiseMap(
					index,
					async (item, i): Promise<WindowContentItem[] | void> => {
						const y = baseY + (i + 1) * lineHeight;

						return await appPaletteEntry(y, item);
					}
				))
			);
		}

		if (!this.#guiLib) return;

		this.#guiLib.setPointerPosition(0);
		this.#guiLib.setContents(items);
	}
}
