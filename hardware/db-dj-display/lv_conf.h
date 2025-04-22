/**
 * @file lv_conf.h
 * Configuration file for LVGL
 */

#ifndef LV_CONF_H
#define LV_CONF_H

#include <stdint.h>

/*====================
   COLOR SETTINGS
 *====================*/

/*Color depth: 1 (1 byte per pixel), 8 (RGB332), 16 (RGB565), 32 (ARGB8888)*/
#define LV_COLOR_DEPTH 16

/*Swap the 2 bytes of RGB565 color. Useful if the display has an 8-bit interface (e.g. SPI)*/
#define LV_COLOR_16_SWAP 0

/*Enable features to draw on transparent background*/
#define LV_COLOR_SCREEN_TRANSP 0

/*Images pixels with this color will not be drawn (with chroma keying)*/
#define LV_COLOR_CHROMA_KEY lv_color_hex(0x00ff00)

/*====================
   MEMORY SETTINGS
 *====================*/

/*Size of the memory available for `lv_mem_alloc()` in bytes (>= 2kB)*/
#define LV_MEM_SIZE (32U * 1024U)

/*Set an address for the memory pool instead of allocating it as an array. Can be in external SRAM too.*/
#define LV_MEM_ADR 0

/*Instead of an address give a memory allocator that will be called to get a memory pool for LVGL. E.g. my_malloc*/
#define LV_MEM_CUSTOM 0

/*Number of the intermediate memory buffer used during rendering and other internal processing mechanisms.*/
#define LV_MEM_BUF_MAX_NUM 16

/*Use the standard `memcpy` and `memset` instead of LVGL's own functions. (Might or might not be faster).*/
#define LV_MEMCPY_MEMSET_STD 0

/*====================
   HAL SETTINGS
 *====================*/

/*Default display refresh period. LVG will redraw changed areas with this period time*/
#define LV_DISP_DEF_REFR_PERIOD 30

/*Input device read period in milliseconds*/
#define LV_INDEV_DEF_READ_PERIOD 30

/*Use a custom tick source that tells the elapsed time in milliseconds.*/
#define LV_TICK_CUSTOM 0
#define LV_TICK_CUSTOM_INCLUDE "Arduino.h"
#define LV_TICK_CUSTOM_SYS_TIME_EXPR (millis())

/*Default Dot Per Inch. Used to initialize default sizes such as widgets sized, style paddings.
 *(Not so important, you can adjust it to modify default sizes and spaces)*/
#define LV_DPI_DEF 130

/*====================
   FEATURE CONFIGURATION
 *====================*/

/*Enable the built-in FreeType font renderer*/
#define LV_USE_FREETYPE 0

/*Enable the built-in STB font renderer*/
#define LV_USE_STB_FREETYPE 0

/*Enable the built-in PNG decoder*/
#define LV_USE_PNG 0

/*Enable the built-in JPG decoder*/
#define LV_USE_JPG 0

/*Enable the built-in GIF decoder*/
#define LV_USE_GIF 0

/*Enable the built-in QR code library*/
#define LV_USE_QRCODE 0

/*Enable the built-in Barcode code library*/
#define LV_USE_BARCODE 0

/*Enable the built-in log system*/
#define LV_USE_LOG 0
#define LV_LOG_LEVEL LV_LOG_LEVEL_WARN
#define LV_LOG_PRINTF 0

/*====================
   FONT USAGE
 *====================*/

/*Montserrat fonts with ASCII range and some symbols using bpp = 4
 *https://fonts.google.com/specimen/Montserrat*/
#define LV_FONT_MONTSERRAT_8 0
#define LV_FONT_MONTSERRAT_10 0
#define LV_FONT_MONTSERRAT_12 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_16 0
#define LV_FONT_MONTSERRAT_18 0
#define LV_FONT_MONTSERRAT_20 0
#define LV_FONT_MONTSERRAT_22 0
#define LV_FONT_MONTSERRAT_24 1
#define LV_FONT_MONTSERRAT_26 0
#define LV_FONT_MONTSERRAT_28 0
#define LV_FONT_MONTSERRAT_30 0
#define LV_FONT_MONTSERRAT_32 0
#define LV_FONT_MONTSERRAT_34 0
#define LV_FONT_MONTSERRAT_36 0
#define LV_FONT_MONTSERRAT_38 0
#define LV_FONT_MONTSERRAT_40 0
#define LV_FONT_MONTSERRAT_42 0
#define LV_FONT_MONTSERRAT_44 0
#define LV_FONT_MONTSERRAT_46 0
#define LV_FONT_MONTSERRAT_48 0

/*Demonstrate special features*/
#define LV_FONT_MONTSERRAT_12_SUBPX 0
#define LV_FONT_MONTSERRAT_28_COMPRESSED 0
#define LV_FONT_DEJAVU_16_PERSIAN_HEBREW 0
#define LV_FONT_SIMSUN_16_CJK 0
#define LV_FONT_UNSCII_8 0
#define LV_FONT_UNSCII_16 0

/*Enable handling large font and/or fonts with a lot of characters.
 *The limit depends on the font size, font face and bpp.
 *Compiler error will be triggered if a font needs it.*/
#define LV_FONT_FMT_TXT_LARGE 0

/*Enables/disables support for compressed fonts.*/
#define LV_USE_FONT_COMPRESSED 0

/*Enable subpixel rendering*/
#define LV_USE_FONT_SUBPX 0
#define LV_FONT_SUBPX_BGR 0

/*====================
   WIDGETS
 *====================*/

/*Enable the built-in widgets*/
#define LV_USE_ARC 1
#define LV_USE_BAR 1
#define LV_USE_BTN 1
#define LV_USE_BTNMATRIX 1
#define LV_USE_CALENDAR 0
#define LV_USE_CANVAS 0
#define LV_USE_CHECKBOX 0
#define LV_USE_DROPDOWN 0
#define LV_USE_IMG 1
#define LV_USE_LABEL 1
#define LV_USE_LINE 0
#define LV_USE_ROLLER 0
#define LV_USE_SLIDER 0
#define LV_USE_SWITCH 0
#define LV_USE_TABLE 0
#define LV_USE_TEXTAREA 0
#define LV_USE_TABVIEW 0
#define LV_USE_TILEVIEW 0
#define LV_USE_WIN 0

/*====================
   EXTRA WIDGETS
 *====================*/

/*Enable the built-in widgets*/
#define LV_USE_CHART 0
#define LV_USE_COLORWHEEL 0
#define LV_USE_IMGBTN 0
#define LV_USE_KEYBOARD 0
#define LV_USE_LED 0
#define LV_USE_LIST 0
#define LV_USE_MENU 0
#define LV_USE_METER 1
#define LV_USE_MSGBOX 1
#define LV_USE_SPAN 1
#define LV_USE_SPINBOX 0
#define LV_USE_SPINNER 0
#define LV_USE_TABVIEW 0

/*====================
   THEME USAGE
 *====================*/

/*A simple, impressive and very complete theme*/
#define LV_USE_THEME_DEFAULT 1

/*A theme designed for monochrome displays*/
#define LV_USE_THEME_MONO 0

/*A theme designed for monochrome displays*/
#define LV_USE_THEME_SIMPLE 0

/*Theme usage*/
#define LV_THEME_DEFAULT_INIT LV_THEME_DEFAULT_COLOR_PRIMARY
#define LV_THEME_DEFAULT_COLOR_PRIMARY lv_color_hex(0x0066cc)
#define LV_THEME_DEFAULT_COLOR_SECONDARY lv_color_hex(0x444444)
#define LV_THEME_DEFAULT_FLAG 0
#define LV_THEME_DEFAULT_FONT_SMALL &lv_font_montserrat_12
#define LV_THEME_DEFAULT_FONT_NORMAL &lv_font_montserrat_14
#define LV_THEME_DEFAULT_FONT_SUBTITLE &lv_font_montserrat_14
#define LV_THEME_DEFAULT_FONT_TITLE &lv_font_montserrat_14

/*====================
   STYLE USAGE
 *====================*/

/*Enable built-in styles*/
#define LV_USE_STYLE_DEFAULT 1
#define LV_USE_STYLE_SIMPLE 1
#define LV_USE_STYLE_RELAXED 1
#define LV_USE_STYLE_FAST 1

/*Style usage*/
#define LV_STYLE_DEFAULT_OPA_SCALE 255

/*====================
   OTHERS
 *====================*/

/*1: Enable API to take snapshot for object*/
#define LV_USE_SNAPSHOT 0

/*1: Enable system monitor component*/
#define LV_USE_SYSMON 0

/*1: Enable the runtime performance profiler*/
#define LV_USE_PROFILER 0

/*1: Enable Monkey test*/
#define LV_USE_MONKEY 0

/*1: Enable grid navigation*/
#define LV_USE_GRIDNAV 0

/*1: Enable lv_obj fragment*/
#define LV_USE_FRAGMENT 0

/*1: Support using images as font in label or span widgets */
#define LV_USE_IMGFONT 0

/*1: Enable a published subscriber based messaging system */
#define LV_USE_MSG 0

/*1: Enable Pinyin input method*/
#define LV_USE_IME_PINYIN 0

/*1: Enable file explorer*/
#define LV_USE_FILE_EXPLORER 0

/*====================
 * DEVICE DRIVERS
 *====================*/

/*Use SDL to open window on PC and handle mouse and keyboard*/
#define LV_USE_SDL 0

/*Driver for /dev/fb*/
#define LV_USE_LINUX_FBDEV 0

/*Use framebuffer device*/
#define LV_USE_FBDEV 0

/*Use X11 to open window on PC and handle mouse and keyboard*/
#define LV_USE_X11 0

/*Driver for /dev/fb*/
#define LV_USE_WAYLAND 0

/*Driver for /dev/fb*/
#define LV_USE_WINDOWS 0

/*Enable POSIX file system*/
#define LV_USE_FS_POSIX 0

/*Enable FATFS file system*/
#define LV_USE_FS_FATFS 0

/*Enable STDIO file system*/
#define LV_USE_FS_STDIO 0

/*Enable Win32 file system*/
#define LV_USE_FS_WIN32 0

#endif /*LV_CONF_H*/