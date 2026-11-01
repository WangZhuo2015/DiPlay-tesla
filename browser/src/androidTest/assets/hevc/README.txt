Synthetic red frames, 320x240, 10 fps, 20 frames. Generated locally with FFmpeg/libx265;
no camera, copyrighted media or device credentials. The Android test only reads/relays
these already encoded bytes and never creates an Android video encoder or decoder.

Reproduce:
ffmpeg -f lavfi -i color=c=red:s=320x240:r=10 -frames:v 20 -pix_fmt yuv420p -c:v libx265 -preset ultrafast -tune zerolatency -x265-params keyint=10:min-keyint=10:scenecut=0:repeat-headers=1:aud=1:bframes=0 -an red.mp4
ffmpeg -i red.mp4 -c copy -bsf:v hevc_mp4toannexb -f hevc red.h265
red.hvcc contains the payload of red.mp4's hvcC atom (without the 8-byte atom header).
