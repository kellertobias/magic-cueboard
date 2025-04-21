"use client";

import clsx from "clsx";
import { useCallback, useMemo } from "react";

interface SPLGraphProps {
  data: number[];
  maxPoints?: number;
  minValue?: number;
  maxValue?: number;
  className?: string;
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
export const getColor = (value: number) => {
  if (value < 80) return "text-green-500";
  if (value < 93) return "text-yellow-500";
  return "text-red-500";
};

export function SPLBar({
  value,
  minValue = 55,
  maxValue = 110,
  className = "",
}: {
  value: number;
  minValue?: number;
  maxValue?: number;
  className?: string;
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
      className={clsx("w-full h-full rounded-lg", className, getColor(value))}
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
      { offset: getStop(103), stopColor: "#FF0000" },
      { offset: getStop(96), stopColor: "#FF0000" },
      { offset: getStop(85), stopColor: "#FFFF00" },
      { offset: getStop(70), stopColor: "#00FF00" },
      { offset: getStop(0), stopColor: "#003300" },
    ];
  }, [minValue, maxValue]);

  // Calculate points for the graph
  const points = data.map((value, index) => scalePoint(value, index)).join(" ");
  const startPoint = scalePoint(data[0], -2);
  const endPoint = scalePoint(data[data.length - 1], data.length + 2);

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
