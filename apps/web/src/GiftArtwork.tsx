import { useId } from "react";

// Original Nimb illustrations. No artwork or account data is loaded from the reference site.
export function GiftArtwork({ template }: { template: string }) {
  const id = useId().replace(/:/g, "");
  const colors: Record<string, [string, string, string]> = {
    star: ["#fff7b3", "#ffc858", "#e58c28"],
    heart: ["#ffb8d1", "#f36595", "#b72c62"],
    flower: ["#e4ceff", "#b68aee", "#7954c8"],
    comet: ["#ffecc0", "#ffbc61", "#ed7740"],
    moon: ["#ecf8ff", "#afcee8", "#7492c6"],
    diamond: ["#defaff", "#80d9f5", "#5b82dc"],
  };
  const palette = colors[template] || colors.star;
  const fill = `url(#${id}-body)`;
  return (
    <svg
      className="gift-artwork"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${id}-body`}
          x1="30"
          y1="20"
          x2="91"
          y2="104"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={palette[0]} />
          <stop offset=".5" stopColor={palette[1]} />
          <stop offset="1" stopColor={palette[2]} />
        </linearGradient>
        <linearGradient
          id={`${id}-trail`}
          x1="13"
          y1="98"
          x2="74"
          y2="39"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={palette[1]} stopOpacity="0" />
          <stop offset="1" stopColor={palette[0]} />
        </linearGradient>
        <filter
          id={`${id}-shadow`}
          x="-40%"
          y="-40%"
          width="180%"
          height="190%"
        >
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="5"
            floodColor="#090818"
            floodOpacity=".3"
          />
        </filter>
      </defs>
      <ellipse cx="60" cy="103" rx="29" ry="5" fill="#050510" opacity=".13" />
      <g filter={`url(#${id}-shadow)`}>
        {template === "heart" ? (
          <>
            <path
              d="M60 97C50 89 22 69 22 47C22 22 49 16 60 34C71 16 98 22 98 47C98 69 70 89 60 97Z"
              fill={fill}
            />
            <path
              d="M33 47C33 35 43 32 49 37"
              stroke="#fff"
              strokeOpacity=".62"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        ) : template === "flower" ? (
          <>
            <path
              d="M60 62V99M60 88C42 91 35 80 36 74C48 73 57 78 60 88ZM61 81C76 84 86 72 82 67C69 68 62 74 61 81Z"
              stroke="#7faa75"
              strokeWidth="5"
              fill="#8cb788"
              strokeLinecap="round"
            />
            <g fill={fill}>
              <ellipse cx="60" cy="35" rx="14" ry="21" />
              <ellipse
                cx="60"
                cy="35"
                rx="14"
                ry="21"
                transform="rotate(72 60 49)"
              />
              <ellipse
                cx="60"
                cy="35"
                rx="14"
                ry="21"
                transform="rotate(144 60 49)"
              />
              <ellipse
                cx="60"
                cy="35"
                rx="14"
                ry="21"
                transform="rotate(216 60 49)"
              />
              <ellipse
                cx="60"
                cy="35"
                rx="14"
                ry="21"
                transform="rotate(288 60 49)"
              />
            </g>
            <circle cx="60" cy="49" r="13" fill="#ffe5a3" />
            <circle cx="57" cy="46" r="5" fill="#fff4cf" />
          </>
        ) : template === "moon" ? (
          <>
            <path
              d="M83 23C75 26 69 32 66 41C57 66 77 86 98 80C88 99 64 106 44 94C21 81 17 53 31 34C43 18 65 13 83 23Z"
              fill={fill}
            />
            <path
              d="M36 44C31 55 32 67 39 76"
              stroke="#fff"
              strokeOpacity=".63"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="m88 32 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z"
              fill="#fff1c9"
            />
            <circle cx="103" cy="65" r="3" fill="#fff1c9" />
          </>
        ) : template === "diamond" ? (
          <>
            <path d="m25 40 17-18h36l17 18-35 58Z" fill={fill} />
            <path
              d="M25 40H95M42 22l-4 18 22 58 22-58-4-18M42 22l18 18 18-18M38 40h44"
              stroke="#fff"
              strokeOpacity=".6"
              strokeWidth="1.8"
            />
            <path d="m25 40 17-18-4 18 22 58Z" fill="#fff" opacity=".2" />
            <path d="m78 22 17 18H82Z" fill="#fff" opacity=".4" />
          </>
        ) : template === "comet" ? (
          <>
            <path
              d="M66 26 15 91l57-36M78 31 39 105l50-61"
              fill={`url(#${id}-trail)`}
            />
            <path
              d="m75 21 8 18 20 3-15 14 3 21-18-10-19 9 5-21-14-15 21-2Z"
              fill={fill}
            />
            <path
              d="m70 35 4-5 5 12 10 2"
              stroke="#fff"
              strokeOpacity=".65"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path
              d="m60 16 14 27 30 5-22 22 5 31-27-14-27 14 5-31-22-22 30-5Z"
              fill={fill}
              stroke={palette[2]}
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path
              d="m60 16 1 46-28 39 5-31-22-22 30-5Z"
              fill="#fff"
              opacity=".13"
            />
            <path
              d="m43 48 10-2 7-15"
              stroke="#fff"
              strokeOpacity=".68"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path d="m61 62 26 39-5-31 22-22Z" fill={palette[2]} opacity=".2" />
          </>
        )}
      </g>
    </svg>
  );
}
