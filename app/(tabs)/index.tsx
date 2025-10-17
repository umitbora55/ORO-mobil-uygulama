import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  GestureResponderEvent,
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  StatusBar as RNStatusBar,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Localization from "expo-localization";
import { I18n } from "i18n-js";

/* ---------------- i18n ---------------- */
const translations = {
  en: {
    title: "ORO",
    best: "BEST",
    level: "LEVEL",
    start: "START",
    gameOver: "GAME OVER!",
    restart: "RESTART",
    finalInfo: "Level: {{level}} · Best: {{best}}",
    continue: "CONTINUE",
    exit: "EXIT",
    settings: "SETTINGS",
    theme: "THEME",
    close: "CLOSE",
    vibration: "VIBRATION",
    on: "ON",
    off: "OFF",
  },
  tr: {
    title: "ORO",
    best: "EN YÜKSEK",
    level: "SEVİYE",
    start: "BAŞLA",
    gameOver: "OYUN BİTTİ!",
    restart: "YENİDEN BAŞLA",
    finalInfo: "Seviye: {{level}} · En Yüksek: {{best}}",
    continue: "DEVAM ET",
    exit: "ÇIKIŞ",
    settings: "AYARLAR",
    theme: "TEMA",
    close: "KAPAT",
    vibration: "TİTREŞİM",
    on: "AÇIK",
    off: "KAPALI",
  },
} as const;

const i18n = new I18n(translations);
i18n.enableFallback = true;
const localeFromDevice =
  Localization.getLocales?.()[0]?.languageCode ??
  Localization.getLocales?.()[0]?.languageTag?.split("-")[0] ??
  "en";
i18n.locale = Object.keys(translations).includes(localeFromDevice)
  ? localeFromDevice
  : "en";
const t = (key: string, params?: Record<string, any>) => i18n.t(key, params);

/* ---------------- Oyun sabitleri ---------------- */
const screenWidth = Dimensions.get("window").width;
const screenHeight = Dimensions.get("window").height;

const CELL_SIZE = 18;
const INITIAL_SPEED = 120;
const MIN_SPEED = 60;
const SPEED_DEC_PER_FOOD = 6;

const BASE_SQUARE = CELL_SIZE - 2;
const SNAKE_SCALE = 0.8;
const BODY_EXTRA = 2;
const HEAD_EXTRA = 6;
const BODY_SIZE = Math.round(BASE_SQUARE * SNAKE_SCALE + BODY_EXTRA);
const HEAD_SIZE = Math.round(BASE_SQUARE * SNAKE_SCALE + HEAD_EXTRA);

/* ---------------- Tipler ---------------- */
type Cell = [number, number];
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type ThemeKey = "modern" | "classic";

/* ---------------- Temalar ---------------- */
const THEMES = {
  modern: {
    name: "Modern",
    background: ["#0c0c11", "#0c0c11", "#0c0c11"],
    panel: "#0c0c11",
    border: "#1A1A24",
    grid: "#0E0E15",
    gridLine: "rgba(255,255,255,0.04)",
    snakeHead: "#F6C90E",
    snakeBody: "#F6C90E",
    food: "#F7E27C",
    accent: "#F6C90E",
    ink: "#EAEAF0",
    inkMuted: "#A7A7B3",
    surface: "#14141D",
    surfaceAlt: "#1B1B26",
  },
  classic: {
    name: "Classic",
    background: ["#0B1410", "#0B1410", "#0B1410"],
    panel: "#0B1410",
    border: "#14231B",
    grid: "#0D1612",
    gridLine: "rgba(200, 255, 220, 0.06)",
    snakeHead: "#F6C90E",
    snakeBody: "#F6C90E",
    food: "#E7F8B7",
    accent: "#86EFAC",
    ink: "#E8F7EE",
    inkMuted: "#A9D7C1",
    surface: "#10261B",
    surfaceAlt: "#143422",
  },
} as const;

type Theme = (typeof THEMES)[ThemeKey];

/* ---------------- Yardımcılar ---------------- */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
const isWrapX = (fromX: number, toX: number, COLS: number) =>
  (fromX === 0 && toX === COLS - 1) || (fromX === COLS - 1 && toX === 0);
const isWrapY = (fromY: number, toY: number, ROWS: number) =>
  (fromY === 0 && toY === ROWS - 1) || (fromY === ROWS - 1 && toY === 0);

function buildMoveAnimation(
  anim: Animated.ValueXY,
  fromCell: { x: number; y: number },
  toCell: { x: number; y: number },
  duration: number,
  easing: (value: number) => number,
  COLS: number,
  ROWS: number
): Animated.CompositeAnimation {
  const wrapX = isWrapX(fromCell.x, toCell.x, COLS);
  const wrapY = isWrapY(fromCell.y, toCell.y, ROWS);
  const fromPx = { x: fromCell.x * CELL_SIZE, y: fromCell.y * CELL_SIZE };
  const toPx = { x: toCell.x * CELL_SIZE, y: toCell.y * CELL_SIZE };
  const offRight = COLS * CELL_SIZE;
  const offLeft = -CELL_SIZE;
  const offBottom = ROWS * CELL_SIZE;
  const offTop = -CELL_SIZE;

  if (wrapX && !wrapY) {
    if (fromCell.x === COLS - 1 && toCell.x === 0) {
      return Animated.sequence([
        Animated.timing(anim, {
          toValue: { x: offRight, y: fromPx.y },
          duration: Math.floor(duration / 2),
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: offLeft, y: toPx.y },
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: toPx.x, y: toPx.y },
          duration: Math.ceil(duration / 2),
          easing,
          useNativeDriver: true,
        }),
      ]);
    } else {
      return Animated.sequence([
        Animated.timing(anim, {
          toValue: { x: offLeft, y: fromPx.y },
          duration: Math.floor(duration / 2),
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: offRight, y: toPx.y },
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: toPx.x, y: toPx.y },
          duration: Math.ceil(duration / 2),
          easing,
          useNativeDriver: true,
        }),
      ]);
    }
  }
  if (!wrapX && wrapY) {
    if (fromCell.y === ROWS - 1 && toCell.y === 0) {
      return Animated.sequence([
        Animated.timing(anim, {
          toValue: { x: fromPx.x, y: offBottom },
          duration: Math.floor(duration / 2),
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: toPx.x, y: offTop },
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: toPx.x, y: toPx.y },
          duration: Math.ceil(duration / 2),
          easing,
          useNativeDriver: true,
        }),
      ]);
    } else {
      return Animated.sequence([
        Animated.timing(anim, {
          toValue: { x: fromPx.x, y: offTop },
          duration: Math.floor(duration / 2),
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: toPx.x, y: offBottom },
          duration: 1,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: { x: toPx.x, y: toPx.y },
          duration: Math.ceil(duration / 2),
          easing,
          useNativeDriver: true,
        }),
      ]);
    }
  }
  return Animated.timing(anim, {
    toValue: toPx,
    duration,
    easing,
    useNativeDriver: true,
  });
}

/* ---------------- App ---------------- */
export default function App() {
  // --- Minimal Splash Ekranı (<= 3s) ---
  const [showSplash, setShowSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashSnakeX = useRef(new Animated.Value(screenWidth + 60)).current; // sağdan başla (ekran dışı)

  // süreler toplamı 2800ms (3 saniyeyi aşmıyor)
  const SPLASH_FADE_IN = 200;
  const SPLASH_RUN = 2200; // yılanın koşusu
  const SPLASH_FADE_OUT = 400;

  useEffect(() => {
    // Fade in
    Animated.timing(splashOpacity, {
      toValue: 1,
      duration: SPLASH_FADE_IN,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      // Yılan sağdan sola hızlı geçiş
      Animated.timing(splashSnakeX, {
        toValue: -120, // sola ekran dışına
        duration: SPLASH_RUN,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        // Fade out
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: SPLASH_FADE_OUT,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(() => setShowSplash(false));
      });
    });
  }, [splashOpacity, splashSnakeX]);

  const [gridSize, setGridSize] = useState<{ cols: number; rows: number }>({
    cols: Math.floor(screenWidth / CELL_SIZE),
    rows: Math.floor((screenHeight - 150) / CELL_SIZE),
  });
  const gridColsRef = useRef(gridSize.cols);
  const gridRowsRef = useRef(gridSize.rows);

  const [snake, setSnake] = useState<Cell[]>([[10, 10]]);
  const [food, setFood] = useState<Cell>([15, 15]);
  const directionRef = useRef<Dir>("RIGHT");
  const inputQueueRef = useRef<Dir[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>("modern");
  const [level, setLevel] = useState(1);
  const [bestLevel, setBestLevel] = useState(0);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [showSettings, setShowSettings] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  const theme: Theme = THEMES[currentTheme];

  const segmentAnimRef = useRef<Animated.ValueXY[]>([
    new Animated.ValueXY({
      x: snake[0][0] * CELL_SIZE,
      y: snake[0][1] * CELL_SIZE,
    }),
  ]);

  /* ---- Home (START) animasyonu ---- */
  const startPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!gameStarted && !gameOver && !showSettings && !showSplash) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(startPulse, {
            toValue: 1.04,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(startPulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => startPulse.stopAnimation();
    }
  }, [gameStarted, gameOver, showSettings, startPulse, showSplash]);

  /* ---- UI görünürlüğü ---- */
  useEffect(() => {
    const active = gameStarted && !gameOver && !isPaused;
    RNStatusBar.setHidden(active || showSplash, "fade");
    const setAndroidUi = async () => {
      if (Platform.OS !== "android") return;
      try {
        if (active) {
          await NavigationBar.setVisibilityAsync("hidden");
          await NavigationBar.setBehaviorAsync("overlay-swipe");
          await NavigationBar.setBackgroundColorAsync("transparent");
        } else {
          await NavigationBar.setVisibilityAsync("visible");
          await NavigationBar.setBehaviorAsync("inset-swipe");
        }
      } catch {}
    };
    setAndroidUi();
    return () => {
      RNStatusBar.setHidden(false, "fade");
      if (Platform.OS === "android") {
        NavigationBar.setVisibilityAsync("visible").catch(() => {});
        NavigationBar.setBehaviorAsync("inset-swipe").catch(() => {});
      }
    };
  }, [gameStarted, gameOver, isPaused, showSplash]);

  /* ---- Persist ---- */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("bestLevel");
        if (saved) setBestLevel(parseInt(saved, 10) || 0);
      } catch {}
    })();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("vibrationEnabled");
        if (saved !== null) setVibrationEnabled(saved === "true");
      } catch {}
    })();
  }, []);
  useEffect(() => {
    AsyncStorage.setItem("vibrationEnabled", String(vibrationEnabled)).catch(
      () => {}
    );
  }, [vibrationEnabled]);

  /* ---- Layout ---- */
  const onGameAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const cols = Math.max(4, Math.floor(width / CELL_SIZE));
    const rows = Math.max(4, Math.floor(height / CELL_SIZE));
    if (cols !== gridColsRef.current || rows !== gridRowsRef.current) {
      gridColsRef.current = cols;
      gridRowsRef.current = rows;
      setGridSize({ cols, rows });
      setSnake(
        (prev) =>
          prev.map(([x, y]) => [
            clamp(x, 0, cols - 1),
            clamp(y, 0, rows - 1),
          ]) as Cell[]
      );
      setFood(([fx, fy]) => [clamp(fx, 0, cols - 1), clamp(fy, 0, rows - 1)]);
    }
  };

  /* ---- Oyun mantığı ---- */
  const generateFood = useCallback((): Cell => {
    const COLS = gridColsRef.current;
    const ROWS = gridRowsRef.current;
    let newFood: Cell;
    let safety = 0;
    do {
      newFood = [
        Math.floor(Math.random() * COLS),
        Math.floor(Math.random() * ROWS),
      ];
      safety++;
      if (safety > 1000) break;
    } while (snake.some((s) => s[0] === newFood[0] && s[1] === newFood[1]));
    return newFood;
  }, [snake]);

  const resetGame = () => {
    const start: Cell = [10, 10];
    setSnake([start]);
    setFood([15, 15]);
    setGameOver(false);
    setIsPaused(false);
    setGameStarted(false);
    setLevel(1);
    setSpeed(INITIAL_SPEED);
    setShowSettings(false);
    directionRef.current = "RIGHT";
    inputQueueRef.current = [];
    segmentAnimRef.current = [
      new Animated.ValueXY({
        x: start[0] * CELL_SIZE,
        y: start[1] * CELL_SIZE,
      }),
    ];
  };

  const handleVibrationToggle = (enabled: boolean) => {
    setVibrationEnabled(enabled);
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const exitAppSmart = () => {
    if (Platform.OS === "android") BackHandler.exitApp();
    else resetGame();
  };

  const handleStart = () => {
    if (vibrationEnabled)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGameStarted(true);
    setIsPaused(false);
  };

  const moveSnake = useCallback(() => {
    if (gameOver || isPaused || !gameStarted) return;
    const COLS = gridColsRef.current;
    const ROWS = gridRowsRef.current;

    if (inputQueueRef.current.length > 0) {
      const nd = inputQueueRef.current.shift();
      if (nd) directionRef.current = nd;
    }

    setSnake((prevSnake) => {
      if (segmentAnimRef.current.length < prevSnake.length) {
        const last = prevSnake[prevSnake.length - 1];
        while (segmentAnimRef.current.length < prevSnake.length) {
          segmentAnimRef.current.push(
            new Animated.ValueXY({
              x: last[0] * CELL_SIZE,
              y: last[1] * CELL_SIZE,
            })
          );
        }
      } else if (segmentAnimRef.current.length > prevSnake.length) {
        segmentAnimRef.current.splice(prevSnake.length);
      }

      const head = prevSnake[0];
      let newHead: Cell = [head[0], head[1]];
      switch (directionRef.current) {
        case "UP":
          newHead = [head[0], head[1] - 1];
          break;
        case "DOWN":
          newHead = [head[0], head[1] + 1];
          break;
        case "LEFT":
          newHead = [head[0] - 1, head[1]];
          break;
        case "RIGHT":
          newHead = [head[0] + 1, head[1]];
          break;
      }

      if (newHead[0] < 0) newHead[0] = COLS - 1;
      if (newHead[0] >= COLS) newHead[0] = 0;
      if (newHead[1] < 0) newHead[1] = ROWS - 1;
      if (newHead[1] >= ROWS) newHead[1] = 0;

      if (prevSnake.some((s) => s[0] === newHead[0] && s[1] === newHead[1])) {
        setGameOver(true);
        if (vibrationEnabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setBestLevel((prev) => {
          const best = Math.max(prev, level);
          AsyncStorage.setItem("bestLevel", String(best)).catch(() => {});
          return best;
        });
        return prevSnake;
      }

      const nextSnake: Cell[] = [newHead, ...prevSnake];
      let ate = false;
      if (newHead[0] === food[0] && newHead[1] === food[1]) {
        ate = true;
      } else {
        nextSnake.pop();
      }

      const anims: Animated.CompositeAnimation[] = [];
      const duration = Math.max(16, speed - 2);
      const easing = Easing.linear;

      {
        const fromHead = { x: prevSnake[0][0], y: prevSnake[0][1] };
        const toHead = { x: newHead[0], y: newHead[1] };
        anims.push(
          buildMoveAnimation(
            segmentAnimRef.current[0],
            fromHead,
            toHead,
            duration,
            easing,
            COLS,
            ROWS
          )
        );
      }

      for (let i = 1; i < nextSnake.length; i++) {
        const fromCell = prevSnake[i] ?? prevSnake[prevSnake.length - 1];
        const toCell = prevSnake[i - 1] ?? prevSnake[prevSnake.length - 1];

        if (!segmentAnimRef.current[i]) {
          segmentAnimRef.current[i] = new Animated.ValueXY({
            x: fromCell[0] * CELL_SIZE,
            y: fromCell[1] * CELL_SIZE,
          });
        }

        anims.push(
          buildMoveAnimation(
            segmentAnimRef.current[i],
            { x: fromCell[0], y: fromCell[1] },
            { x: toCell[0], y: toCell[1] },
            duration,
            easing,
            COLS,
            ROWS
          )
        );
      }

      if (ate) {
        setLevel((lv) => lv + 1);
        setSpeed((p) => Math.max(MIN_SPEED, p - SPEED_DEC_PER_FOOD));
        setFood(generateFood());
        if (vibrationEnabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const lastOld = prevSnake[prevSnake.length - 1];
        segmentAnimRef.current.push(
          new Animated.ValueXY({
            x: lastOld[0] * CELL_SIZE,
            y: lastOld[1] * CELL_SIZE,
          })
        );
      }

      Animated.parallel(anims).start();
      return nextSnake;
    });
  }, [
    generateFood,
    gameOver,
    gameStarted,
    isPaused,
    speed,
    food,
    level,
    vibrationEnabled,
  ]);

  useEffect(() => {
    if (gameOver || isPaused || !gameStarted) return;
    let rafId: number | null = null;
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      if (now - last >= speed) {
        moveSnake();
        last = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [moveSnake, speed, gameOver, isPaused, gameStarted]);

  /* ---- Touch ---- */
  const handleTouchStart = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    setTouchStart({ x: t.pageX, y: t.pageY });
  };
  const handleTouchEnd = (e: GestureResponderEvent) => {
    if (!touchStart || !gameStarted) return;
    const t = e.nativeEvent;
    const end = { x: t.pageX, y: t.pageY };
    const dx = end.x - touchStart.x;
    const dy = end.y - touchStart.y;
    let ndir: Dir | null = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 30 && directionRef.current !== "LEFT") ndir = "RIGHT";
      else if (dx < -30 && directionRef.current !== "RIGHT") ndir = "LEFT";
    } else {
      if (dy > 30 && directionRef.current !== "UP") ndir = "DOWN";
      else if (dy < -30 && directionRef.current !== "DOWN") ndir = "UP";
    }
    if (ndir && inputQueueRef.current.length < 3)
      inputQueueRef.current.push(ndir);
    setTouchStart(null);
  };

  const active = gameStarted && !gameOver && !isPaused;
  const isHome = !gameStarted && !showSettings && !gameOver && !showSplash;

  /* ---- Göz konumu ---- */
  const getEyeStyle = (size: number) => {
    const dot = Math.max(4, Math.floor(size * 0.14));
    // Splash'ta yılan SOLA giderken göz solda; oyunda yön dinamik
    let top = size * 0.35,
      left = size * 0.6;
    switch (directionRef.current) {
      case "LEFT":
        top = size * 0.35;
        left = size * 0.2;
        break;
      case "UP":
        top = size * 0.2;
        left = size * 0.42;
        break;
      case "DOWN":
        top = size * 0.6;
        left = size * 0.42;
        break;
    }
    return { width: dot, height: dot, borderRadius: dot / 2, top, left };
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background[0] }]}>
      <StatusBar style="light" hidden={active || showSplash} animated />

      {/* --- Minimal Splash (3 sn'den kısa, yılan sağdan sola geçer) --- */}
      {showSplash && (
        <Animated.View
          style={[
            styles.splash,
            { backgroundColor: theme.panel, opacity: splashOpacity },
          ]}
        >
          <Text style={[styles.splashTitle, { color: theme.ink }]}>
            {t("title")}
          </Text>

          {/* Splash Snake (4 segment) */}
          <View style={styles.splashSnakeTrack} pointerEvents="none">
            {[0, 1, 2, 3].map((i) => {
              const offset = i * 18; // gövde aralığı
              return (
                <Animated.View
                  key={`sps-${i}`}
                  style={[
                    styles.splashSeg,
                    {
                      backgroundColor: theme.snakeBody,
                      opacity: 1 - i * 0.18,
                      transform: [
                        {
                          translateX: Animated.add(
                            splashSnakeX,
                            new Animated.Value(offset)
                          ),
                        },
                      ],
                    },
                  ]}
                />
              );
            })}
            {/* Baş */}
            <Animated.View
              style={[
                styles.splashHead,
                {
                  backgroundColor: theme.snakeHead,
                  transform: [{ translateX: splashSnakeX }],
                },
              ]}
            >
              {/* Göz (sola bakan) */}
              <View
                style={{
                  position: "absolute",
                  width: 3.5,
                  height: 3.5,
                  borderRadius: 2,
                  left: 6,
                  top: 7,
                  backgroundColor: theme.panel,
                  opacity: 0.9,
                }}
              />
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* HEADER – anasayfada TAMAMEN GİZLİ */}
      {!isHome && !showSplash && (
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.border, backgroundColor: theme.panel },
          ]}
        >
          <View style={styles.headerSide}>
            {gameStarted && !gameOver && (
              <View style={styles.headerLevelBadge}>
                <Text
                  style={[styles.headerLevelLabel, { color: theme.inkMuted }]}
                >
                  {t("level")}
                </Text>
                <Text
                  style={[styles.headerLevelValue, { color: theme.accent }]}
                >
                  {level}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.headerCenter} pointerEvents="none">
            <Text style={[styles.title, { color: theme.ink }]}>
              {t("title")}
            </Text>
          </View>
          <View style={styles.headerSideRight}>
            {gameStarted && !gameOver && (
              <>
                <Pressable
                  onPress={() => {
                    setShowSettings(true);
                    setIsPaused(true);
                  }}
                  style={styles.iconButton}
                  hitSlop={10}
                >
                  <Ionicons
                    name="settings-outline"
                    size={20}
                    color={theme.ink}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setIsPaused((x) => !x)}
                  style={styles.iconButton}
                  hitSlop={10}
                >
                  <Ionicons
                    name={isPaused ? "play" : "pause"}
                    size={20}
                    color={theme.ink}
                  />
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {/* GAME AREA */}
      <View
        style={[
          styles.gameArea,
          {
            backgroundColor: theme.grid,
            borderColor: isHome || showSplash ? "transparent" : theme.border,
          },
        ]}
        onLayout={onGameAreaLayout}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Snake & Food – yalnızca oyun sırasında */}
        {gameStarted && !showSplash && (
          <>
            {segmentAnimRef.current.slice(0, snake.length).map((av, i) => {
              const isHead = i === 0;
              const size = isHead ? HEAD_SIZE : BODY_SIZE;
              const delta = size - BASE_SQUARE;
              return (
                <Animated.View
                  key={`seg-${i}`}
                  style={[
                    styles.segmentBase,
                    {
                      width: size,
                      height: size,
                      marginLeft: -(delta / 2),
                      marginTop: -(delta / 2),
                      backgroundColor: isHead
                        ? theme.snakeHead
                        : theme.snakeBody,
                      borderRadius: size / 2,
                      transform: [{ translateX: av.x }, { translateY: av.y }],
                    },
                  ]}
                  renderToHardwareTextureAndroid
                >
                  {isHead && (
                    <View
                      style={[
                        styles.eye,
                        { backgroundColor: theme.panel },
                        getEyeStyle(size),
                      ]}
                    />
                  )}
                </Animated.View>
              );
            })}

            <View
              style={[
                styles.food,
                {
                  left: clamp(food[0], 0, gridSize.cols - 1) * CELL_SIZE,
                  top: clamp(food[1], 0, gridSize.rows - 1) * CELL_SIZE,
                  backgroundColor: theme.food,
                },
              ]}
              pointerEvents="none"
            />
          </>
        )}

        {/* HOME – tam ekran anasayfa */}
        {isHome && (
          <View style={styles.homeWrap}>
            <Text style={[styles.homeTitle, { color: theme.ink }]}>
              {t("title")}
            </Text>

            <View style={styles.dividerContainer}>
              <View
                style={[
                  styles.dividerLine,
                  { backgroundColor: theme.inkMuted },
                ]}
              />
            </View>

            <Text style={[styles.homeSubtitle, { color: theme.inkMuted }]}>
              The Snake
            </Text>

            <Animated.Text
              style={[
                styles.startHero,
                { color: theme.ink, transform: [{ scale: startPulse }] },
              ]}
            >
              {t("start")}
            </Animated.Text>

            <Pressable
              onPress={handleStart}
              style={[styles.ctaPrimary, { backgroundColor: theme.accent }]}
              hitSlop={8}
            >
              <Ionicons name="play" size={16} color="#111" />
              <Text style={styles.ctaPrimaryText}>{t("start")}</Text>
            </Pressable>

            <View style={styles.homeRow}>
              <Pressable
                onPress={() => setShowSettings(true)}
                style={[
                  styles.ctaOutline,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                ]}
                hitSlop={8}
              >
                <Ionicons name="settings-outline" size={16} color={theme.ink} />
                <Text style={[styles.ctaOutlineText, { color: theme.ink }]}>
                  {t("settings")}
                </Text>
              </Pressable>

              <Pressable
                onPress={exitAppSmart}
                style={styles.ctaTextBtn}
                hitSlop={8}
              >
                <Ionicons
                  name="exit-outline"
                  size={16}
                  color={theme.inkMuted}
                />
                <Text
                  style={[styles.ctaTextBtnText, { color: theme.inkMuted }]}
                >
                  {t("exit")}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* GAME OVER */}
        {gameOver && !showSplash && (
          <View style={styles.overlay}>
            <Text style={[styles.gameOverText, { color: theme.ink }]}>
              {t("gameOver")}
            </Text>
            <Text style={[styles.finalInfo, { color: theme.inkMuted }]}>
              {t("finalInfo", { level, best: bestLevel })}
            </Text>
            <Pressable
              onPress={resetGame}
              style={[styles.ctaPrimary, { backgroundColor: theme.accent }]}
              hitSlop={8}
            >
              <Ionicons name="refresh" size={16} color="#111" />
              <Text style={styles.ctaPrimaryText}>{t("restart")}</Text>
            </Pressable>
          </View>
        )}

        {/* PAUSE */}
        {isPaused && !showSettings && gameStarted && !showSplash && (
          <View style={styles.overlay}>
            <Pressable
              onPress={() => setIsPaused(false)}
              style={[styles.ctaPrimary, { backgroundColor: theme.accent }]}
              hitSlop={8}
            >
              <Ionicons name="play" size={16} color="#111" />
              <Text style={styles.ctaPrimaryText}>{t("continue")}</Text>
            </Pressable>
            <Pressable
              onPress={exitAppSmart}
              style={[
                styles.ctaOutline,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
              hitSlop={8}
            >
              <Ionicons name="exit-outline" size={16} color={theme.ink} />
              <Text style={[styles.ctaOutlineText, { color: theme.ink }]}>
                {t("exit")}
              </Text>
            </Pressable>
          </View>
        )}

        {/* SETTINGS */}
        {showSettings && !showSplash && (
          <View style={styles.overlay}>
            <View
              style={[
                styles.settingsContainer,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.settingsTitle, { color: theme.ink }]}>
                {t("settings")}
              </Text>

              <View style={styles.settingSection}>
                <Text style={[styles.settingLabel, { color: theme.inkMuted }]}>
                  {t("theme")}
                </Text>
                <View style={styles.themeOptions}>
                  <Pressable
                    onPress={() => setCurrentTheme("modern")}
                    style={[
                      styles.themeOption,
                      {
                        backgroundColor: theme.surface,
                        borderColor:
                          currentTheme === "modern"
                            ? theme.accent
                            : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.themeOptionText,
                        {
                          color:
                            currentTheme === "modern"
                              ? theme.ink
                              : theme.inkMuted,
                        },
                      ]}
                    >
                      Modern
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setCurrentTheme("classic")}
                    style={[
                      styles.themeOption,
                      {
                        backgroundColor: theme.surface,
                        borderColor:
                          currentTheme === "classic"
                            ? theme.accent
                            : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.themeOptionText,
                        {
                          color:
                            currentTheme === "classic"
                              ? theme.ink
                              : theme.inkMuted,
                        },
                      ]}
                    >
                      Classic
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingSection}>
                <Text style={[styles.settingLabel, { color: theme.inkMuted }]}>
                  {t("vibration")}
                </Text>
                <View style={styles.themeOptions}>
                  <Pressable
                    onPress={() => handleVibrationToggle(true)}
                    style={[
                      styles.themeOption,
                      {
                        backgroundColor: theme.surface,
                        borderColor: vibrationEnabled
                          ? theme.accent
                          : theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={16}
                      color={vibrationEnabled ? theme.ink : theme.inkMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionText,
                        {
                          color: vibrationEnabled ? theme.ink : theme.inkMuted,
                        },
                      ]}
                    >
                      {t("on")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleVibrationToggle(false)}
                    style={[
                      styles.themeOption,
                      {
                        backgroundColor: theme.surface,
                        borderColor: !vibrationEnabled
                          ? theme.accent
                          : theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={!vibrationEnabled ? theme.ink : theme.inkMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionText,
                        {
                          color: !vibrationEnabled ? theme.ink : theme.inkMuted,
                        },
                      ]}
                    >
                      {t("off")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={() => setShowSettings(false)}
                style={[styles.closeButton, { backgroundColor: theme.surface }]}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={theme.ink} />
                <Text style={[styles.closeButtonText, { color: theme.ink }]}>
                  {t("close")}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Splash
  splash: {
    position: "absolute",
    inset: 0 as any,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  splashTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  splashSnakeTrack: {
    width: "100%",
    height: 34,
    overflow: "hidden",
    justifyContent: "center",
  },
  splashSeg: {
    position: "absolute",
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  splashHead: {
    position: "absolute",
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  // Header
  header: {
    height: 56,
    justifyContent: "center",
    borderBottomWidth: 1,
  },
  headerSide: {
    width: 100,
    paddingLeft: 12,
    justifyContent: "center",
  },
  headerSideRight: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    width: 100,
    justifyContent: "flex-end",
  },
  headerCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 10,
    alignItems: "center",
    zIndex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 2,
  },
  iconButton: {
    padding: 8,
    borderRadius: 10,
    marginLeft: 4,
  },
  headerLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerLevelLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  headerLevelValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  // Game area
  gameArea: {
    flex: 1,
    width: "100%",
    borderWidth: 1,
    position: "relative",
    overflow: "hidden",
  },

  // Snake
  segmentBase: { position: "absolute" },
  eye: { position: "absolute", opacity: 0.9 },

  // Food
  food: {
    position: "absolute",
    width: BASE_SQUARE,
    height: BASE_SQUARE,
    borderRadius: BASE_SQUARE / 2,
  },

  // Home
  homeWrap: {
    position: "absolute",
    inset: 0 as any,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  homeTitle: {
    fontSize: 14,
    letterSpacing: 4,
    opacity: 0.85,
    marginBottom: 8,
  },
  dividerContainer: {
    width: 120,
    alignItems: "center",
    marginBottom: 8,
  },
  dividerLine: {
    width: "100%",
    height: 1,
    opacity: 0.3,
  },
  homeSubtitle: {
    fontSize: 11,
    letterSpacing: 2,
    opacity: 0.6,
    marginBottom: 28,
    fontWeight: "500",
  },
  startHero: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  homeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  // Buttons
  ctaPrimary: {
    minWidth: 180,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaPrimaryText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "800",
  },
  ctaOutline: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minWidth: 120,
  },
  ctaOutlineText: { fontSize: 14, fontWeight: "700" },
  ctaTextBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    minWidth: 100,
  },
  ctaTextBtnText: { fontSize: 14, fontWeight: "600" },

  // Shared overlays
  overlay: {
    position: "absolute",
    inset: 0 as any,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
  },

  // Game over
  gameOverText: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  finalInfo: { fontSize: 16, marginBottom: 16 },

  // Settings
  settingsContainer: {
    padding: 16,
    borderRadius: 14,
    minWidth: 280,
    maxWidth: "92%",
    borderWidth: 1,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
    textAlign: "center",
  },
  settingSection: { marginBottom: 14 },
  settingLabel: { fontSize: 12, letterSpacing: 0.5, marginBottom: 8 },
  themeOptions: { flexDirection: "row", gap: 10 },
  themeOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  themeOptionText: { fontSize: 14, fontWeight: "600" },
  closeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    marginTop: 6,
  },
  closeButtonText: { fontSize: 14, fontWeight: "600" },
});
