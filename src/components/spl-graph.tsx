"use client";

import clsx from "clsx";
import { useCallback, useMemo } from "react";
import type { SPLColor, SPLThresholds } from "@/lib/spl-settings";

interface SPLGraphProps {
  data: number[];
  maxPoints?: number;
  minValue?: number;
  maxValue?: number;
  className?: string;
  thresholds?: SPLThresholds;
}

const scaleValue = (
  value: number,
  minValue: number,
  maxValue: number,
  scaleHeight: number
) => {
  // Scale value between min and max to fit within scaleHeight
  // Inverted since SVG coordinates go from top to bottom
  const pointValue =
    scaleHeight - ((value - minValue) / (maxValue - minValue)) * scaleHeight;

  return Math.min(scaleHeight, Math.max(0, pointValue));
};

const makeScalePoint = (props: {
  svgWidth: number;
  svgHeight: number;
  maxPoints: number;
  minValue: number;
  maxValue: number;
}) => {
  const { svgWidth, svgHeight, maxPoints, minValue, maxValue } = props;
  return (value: number, index: number) => {
    const x = (index / (maxPoints - 1)) * svgWidth;
    const y = scaleValue(value, minValue, maxValue, svgHeight);
    return `${x},${y}`;
  };
};

// Get color based on dBA value
export const getColor = (color: SPLColor) => {
  return { blue: "text-blue-400", green: "text-green-500", yellow: "text-yellow-400", red: "text-red-500", "red-blink": "text-red-500 animate-pulse" }[color];
};

export function SPLBar({
  value,
  minValue = 55,
  maxValue = 110,
  className = "",
  color = "blue",
}: {
  value: number;
  minValue?: number;
  maxValue?: number;
  className?: string;
  color?: SPLColor;
}) {
  const svgWidth = 200;
  const svgHeight = 100;

  // Calculate scaled value for bar height
  const barSize = scaleValue(value, maxValue, minValue, svgWidth);

  return (
    <svg
      role="img"
      aria-label="SPL Bar"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="none"
      className={clsx("w-full h-full rounded-lg", className, getColor(color))}
    >
      <rect
        y="0"
        x={0}
        height={svgWidth}
        width={barSize}
        className="fill-current"
      />
    </svg>
  );
}

export function SPLGraph({
  data,
  maxPoints = 100,
  minValue = 55,
  maxValue = 130,
  className = "",
  thresholds = { green: 70, yellow: 80, red: 93 },
}: SPLGraphProps) {
  const svgWidth = 200;
  const svgHeight = 100;

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const scalePoint = useCallback(
    makeScalePoint({ svgWidth, svgHeight, maxPoints, minValue, maxValue }),
    [svgWidth, svgHeight, maxPoints, minValue, maxValue]
  );

  const colorStops = useMemo(() => {
    const getStop = (value: number) => {
      return scaleValue(value, minValue, maxValue, 1);
    };
    return [
      { offset: getStop(maxValue), stopColor: "#EF4444" },
      { offset: getStop(thresholds.red), stopColor: "#EF4444" },
      { offset: getStop(thresholds.yellow), stopColor: "#FACC15" },
      { offset: getStop(thresholds.green), stopColor: "#22C55E" },
      { offset: getStop(minValue), stopColor: "#60A5FA" },
    ];
  }, [minValue, maxValue, thresholds.green, thresholds.yellow, thresholds.red]);

  // Calculate points for the graph
  const points = data.map((value, index) => scalePoint(value, index)).join(" ");
  const startPoint = scalePoint(data[0] ?? minValue, -2);
  const endPoint = scalePoint(data[data.length - 1] ?? minValue, data.length + 2);

  return (
    <svg
      role="img"
      aria-label="SPL Graph"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="none"
      className={clsx(
        "w-full h-full rounded-lg outline outline-1 outline-gray-700",
        className
      )}
    >
      <defs>
        {/* Gradient for the line - using gradientUnits="userSpaceOnUse" to make it absolute */}
        <linearGradient
          id="lineGradient"
          x1="0"
          y1="0"
          x2="0"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#AA0000" />
          {colorStops.map(({ offset, stopColor }) => (
            <stop key={offset} offset={offset} stopColor={stopColor} />
          ))}
        </linearGradient>
      </defs>

      {/* Background */}
      <rect
        x="0"
        y="0"
        width={svgWidth}
        height={svgHeight}
        className="fill-gray-900"
      />

      {/* Graph line */}
      <polygon
        points={`${startPoint} ${points} ${endPoint} ${svgWidth + 2},${
          svgHeight + 2
        } -1,${svgHeight + 2}`}
        stroke="url(#lineGradient)"
        strokeWidth="2"
        fill="url(#lineGradient)"
        fillOpacity="0.30"
      />
    </svg>
  );
}
