import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Star, c as Menu, d as ChartColumn, f as ArrowRight, i as Target, l as Inbox, n as Workflow, o as Search, s as Plus, t as X, u as ChevronDown } from "../_libs/lucide-react.mjs";
import { t as cn } from "./utils-C_uf36nf.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-WNTkvakv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function BrandImg({ src, title, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
		src,
		alt: title,
		title,
		className: cn("size-5 object-contain", className),
		width: 20,
		height: 20,
		draggable: false
	});
}
function LogoGmail({ className, title = "Gmail" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/gmail.svg",
		title,
		className
	});
}
function LogoDrive({ className, title = "Google Drive" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/googledrive.svg",
		title,
		className
	});
}
function LogoCalendar({ className, title = "Google Calendar" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/googlecalendar.svg",
		title,
		className
	});
}
function LogoSlack({ className, title = "Slack" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/slack.svg",
		title,
		className
	});
}
function LogoNotion({ className, title = "Notion" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/notion.svg",
		title,
		className
	});
}
function LogoAsana({ className, title = "Asana" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/asana.svg",
		title,
		className
	});
}
function LogoOpenAI({ className, title = "OpenAI" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/openai.svg",
		title,
		className
	});
}
function LogoAnthropic({ className, title = "Anthropic" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/anthropic.svg",
		title,
		className
	});
}
function LogoGemini({ className, title = "Google Gemini" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/googlegemini.svg",
		title,
		className
	});
}
function LogoXAI({ className, title = "xAI" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/xai.svg",
		title,
		className
	});
}
function LogoDeepSeek({ className, title = "DeepSeek" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/deepseek.svg",
		title,
		className
	});
}
function LogoKimi({ className, title = "Kimi" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandImg, {
		src: "/brands/kimi.svg",
		title,
		className
	});
}
/** Colored assistant glyphs — distinct, not the brand shark */
function GlyphRocket({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		className: cn("size-5", className),
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M12 3c3.2 1.8 5.5 5.2 5.5 9.2 0 1.3-.3 2.5-.8 3.6L12 21l-4.7-5.2c-.5-1.1-.8-2.3-.8-3.6C6.5 8.2 8.8 4.8 12 3z",
				fill: "currentColor",
				opacity: ".18"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M12 4.2c2.6 1.5 4.5 4.4 4.5 7.8 0 1-.2 2-.6 2.9L12 19.4l-3.9-4.5c-.4-.9-.6-1.9-.6-2.9 0-3.4 1.9-6.3 4.5-7.8z",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "11.2",
				r: "1.6",
				fill: "currentColor"
			})
		]
	});
}
function GlyphInbox({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		className: cn("size-5", className),
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M4 8.5 12 4l8 4.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5z",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "M4 12h4.2a2 2 0 0 1 1.8 1.1l.3.6a2 2 0 0 0 1.8 1.1h1.8a2 2 0 0 0 1.8-1.1l.3-.6A2 2 0 0 1 15.8 12H20",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinejoin: "round"
		})]
	});
}
function GlyphSearch({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		className: cn("size-5", className),
		fill: "none",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "11",
			cy: "11",
			r: "5.5",
			stroke: "currentColor",
			strokeWidth: "1.5"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "m15.5 15.5 4 4",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round"
		})]
	});
}
function GlyphTravel({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 24 24",
		className: cn("size-5", className),
		fill: "none",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M3.5 14.5 20 9.5l-2.2 7.2a1.5 1.5 0 0 1-1.4 1H8.6a1.5 1.5 0 0 1-1.4-.9L3.5 14.5z",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M9 11.5 7 5.5l2.2.6L12 11",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "m15 10.2 2.8-3.7 1.5 1.6-2.2 3.2",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinejoin: "round"
			})
		]
	});
}
function AppMock() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mock-shell mx-auto w-full max-w-[980px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 border-b border-border bg-mock-chrome px-3.5 py-2.5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-[6px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[11px] rounded-full bg-[#ff5f57]" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[11px] rounded-full bg-[#febc2e]" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[11px] rounded-full bg-[#28c840]" })
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-1 items-center justify-center gap-1.5 pr-8 text-[12px] font-medium text-fg-subtle",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "grid size-4 place-items-center rounded text-[#3b6ef5]",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRocket, { className: "size-3.5" })
				}), "Launch coordinator"]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid min-h-[500px] md:grid-cols-[220px_1fr]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "hidden border-r border-border bg-mock p-3 md:block",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex items-center gap-2 rounded-[10px] border border-border bg-bg-elevated px-2.5 py-2 shadow-soft",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid size-7 place-items-center overflow-hidden rounded-lg bg-fg",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: "/logo-shark.png",
									alt: "",
									className: "h-4 w-auto brightness-0 invert"
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "min-w-0 flex-1 truncate text-[12px] font-semibold",
								children: "The Computer"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
								className: "size-3.5 text-fg-subtle",
								strokeWidth: 1.75
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "mb-4 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-border bg-bg-elevated py-2 text-[13px] font-medium shadow-soft",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3.5" }), "New Task"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-1.5 px-1.5 text-[10px] font-medium text-fg-subtle",
						children: "Starred"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-4 space-y-0.5 text-[13px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								active: true,
								title: "Launch coordinator",
								time: "2w",
								star: true,
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "grid size-5 place-items-center rounded-md bg-[#e8f0fe] text-[#1a56db]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRocket, { className: "size-3" })
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								title: "Pull launch feedback",
								time: "1d",
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dot, {})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								title: "Draft release notes",
								time: "17h",
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dot, {})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								title: "Find launch blockers",
								time: "1d",
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dot, {})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "px-2 py-1 text-[12px] text-fg-subtle",
								children: "Show more"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-1.5 px-1.5 text-[10px] font-medium text-fg-subtle",
						children: "Your Assistants"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-0.5 text-[13px]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								title: "Customer researcher",
								time: "2h",
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "grid size-5 place-items-center rounded-md bg-[#f4f3ff] text-[#5925dc]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphSearch, { className: "size-3" })
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								title: "Inbox manager",
								time: "4h",
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "grid size-5 place-items-center rounded-md bg-[#e8f0fe] text-[#1a56db]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphInbox, { className: "size-3" })
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
								title: "Travel planner",
								time: "8h",
								glyph: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "grid size-5 place-items-center rounded-md bg-[#ecfdf3] text-[#067647]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphTravel, { className: "size-3" })
								})
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "mt-2 flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[12px] text-fg-subtle",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3" }), "Add assistant"]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "flex min-h-[500px] flex-col bg-bg-elevated",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-1 flex-col px-5 pb-3 pt-8 sm:px-10",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mx-auto mb-8 flex max-w-sm flex-col items-center text-center",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mb-3 grid size-14 place-items-center rounded-2xl bg-[#e8f0fe] text-[#1a56db] ring-1 ring-[#c7d7fe]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRocket, { className: "size-7" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[15px] font-semibold tracking-tight",
									children: "Launch coordinator"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-0.5 text-[12px] text-fg-subtle",
									children: "You created this conversation"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-[11px] text-fg-subtle",
									children: "Thu, Aug 6, 8:25 AM"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-4 flex justify-end",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "max-w-[min(100%,400px)] rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-[13.5px] leading-relaxed text-fg",
								children: "Pull together the plan for Thursday's launch. Flag anything that could block us."
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "grid size-4 place-items-center rounded text-[#1a56db]",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRocket, { className: "size-3" })
							}), "Launch coordinator"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "max-w-[min(100%,460px)] space-y-3 rounded-2xl rounded-tl-md border border-border bg-bg-elevated px-4 py-3.5 text-[13.5px] leading-relaxed shadow-soft",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "I pulled the release checklist, open PRs, and customer comms into one plan." }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-2 rounded-xl bg-bg-subtle/80 p-3 text-[12.5px]",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
											ready: true,
											text: "The macOS build is signed and notarized"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {
											ready: true,
											text: "Support coverage is confirmed from 8 AM PT"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, { text: "The Windows waitlist email still needs approval" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, { text: "Release notes are missing the rollback owner" })
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-fg-muted",
									children: "I can draft both now."
								})
							]
						})] })
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "border-t border-border px-4 py-3 sm:px-5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3 rounded-2xl border border-border bg-bg-subtle/40 px-3.5 py-2.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							readOnly: true,
							placeholder: "Send another message...",
							className: "min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-subtle"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "hidden items-center gap-1.5 text-[11px] font-medium text-fg-subtle sm:inline-flex",
							children: "openai/gpt-5.6-terra"
						})]
					})
				})]
			})]
		})]
	});
}
function Dot() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "grid size-5 place-items-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-full border border-border-strong/50" })
	});
}
function Row({ title, time, active, star, glyph }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("flex items-center gap-2 rounded-[9px] px-2 py-1.5", active ? "bg-[#edf2ff] text-fg" : "text-fg-muted"),
		children: [
			glyph,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 flex-1 truncate",
				children: title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shrink-0 text-[11px] tabular-nums text-fg-subtle",
				children: time
			}),
			star ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, { className: "size-3 fill-primary text-primary" }) : null
		]
	});
}
function Status({ ready, text }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-start gap-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: ready ? "mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-ready" : "mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-attention" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: ready ? "font-semibold text-ready" : "font-semibold text-attention",
			children: ready ? "Ready" : "Needs attention"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "text-fg-muted",
			children: [" ", text]
		})] })]
	});
}
var faqs = [
	{
		q: "How does Sharker work?",
		a: "Tell Sharker the outcome you want. It gathers the right context from your emails, files, conversations, and connected tools, completes the required steps, and returns the result for review."
	},
	{
		q: "What tools does Sharker connect with?",
		a: "Gmail, Google Drive, Google Calendar, Slack, Outlook, browser profiles, MCP servers, and more. Connect the apps you already use so Sharker can act across them."
	},
	{
		q: "What are the biggest differences compared to Cowork or ChatGPT Work?",
		a: "Sharker gives you specialized assistants that finish work end to end — not generic threads. Switch models freely, keep tools and context, and review finished results instead of coordinating chat."
	},
	{
		q: "Is my data secure and private?",
		a: "We never train on your content. Sessions include audit trails, and sensitive actions require confirmation. Your tools stay under your control."
	},
	{
		q: "Who is Sharker for?",
		a: "Founders, operators, and teams who want to spend time on decisions — not coordination. If your work lives across browser tabs, inboxes, and files, Sharker is built for you."
	}
];
function FaqSection() {
	const [open, setOpen] = (0, import_react.useState)(0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mx-auto max-w-2xl space-y-2.5",
		children: faqs.map((item, i) => {
			const isOpen = open === i;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-soft backdrop-blur-md",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center justify-between gap-4 px-5 py-4 text-left",
					onClick: () => setOpen(isOpen ? null : i),
					"aria-expanded": isOpen,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[15px] font-medium tracking-tight text-fg",
						children: item.q
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
						className: cn("size-4 shrink-0 text-fg-subtle transition-transform duration-200", isOpen && "rotate-180"),
						strokeWidth: 1.75
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("grid transition-all duration-200", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-hidden",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "border-t border-border/60 px-5 py-4 text-[14px] leading-relaxed text-fg-muted text-pretty",
							children: item.a
						})
					})
				})]
			}, item.q);
		})
	});
}
var assistants = [
	{
		id: "inbox",
		name: "Inbox Zero",
		desc: "Clears the queue",
		blurb: "Triages email, drafts replies, and keeps your inbox clear without losing the threads that matter.",
		tools: [
			"Gmail",
			"Calendar",
			"Browser"
		],
		model: "openai/gpt-5.6-terra",
		Icon: Inbox,
		accent: "bg-[#e8f0fe] text-[#1a56db]"
	},
	{
		id: "sales",
		name: "Sales Master",
		desc: "Moves deals forward",
		blurb: "Follows up on CRM opportunities, drafts outreach, and schedules the next step with buyers.",
		tools: [
			"CRM",
			"Gmail",
			"Calendar"
		],
		model: "anthropic/claude-fable-5",
		Icon: Target,
		accent: "bg-[#ecfdf3] text-[#067647]"
	},
	{
		id: "research",
		name: "Research Scout",
		desc: "Finds what matters",
		blurb: "Pulls the right sources, summarizes findings, and surfaces decisions instead of open tabs.",
		tools: [
			"Browser",
			"Drive",
			"Web"
		],
		model: "openai/gpt-5.6-terra",
		Icon: Search,
		accent: "bg-[#f4f3ff] text-[#5925dc]"
	},
	{
		id: "project",
		name: "Project Captain",
		desc: "Keeps work on track",
		blurb: "Tracks launch checklists, open PRs, and blockers — then drafts the updates your team needs.",
		tools: [
			"Git",
			"Slack",
			"Drive"
		],
		model: "openai/gpt-5.6-luna",
		Icon: Workflow,
		accent: "bg-[#fff6ed] text-[#c4320a]"
	},
	{
		id: "finance",
		name: "Finance Keeper",
		desc: "Watches every number",
		blurb: "Reconciles receipts, flags anomalies, and keeps purchasing requests moving without chaos.",
		tools: [
			"Sheets",
			"Gmail",
			"Drive"
		],
		model: "openai/gpt-5.6-sol",
		Icon: ChartColumn,
		accent: "bg-[#f0f9ff] text-[#026aa2]"
	}
];
function FeatureGrid() {
	const [activeId, setActiveId] = (0, import_react.useState)("inbox");
	const active = assistants.find((a) => a.id === activeId) ?? assistants[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mock-shell mx-auto max-w-[920px]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 border-b border-border bg-mock-chrome px-3.5 py-2.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-[6px]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[11px] rounded-full bg-[#ff5f57]" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[11px] rounded-full bg-[#febc2e]" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-[11px] rounded-full bg-[#28c840]" })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex-1 text-center text-[12px] font-medium text-fg-subtle",
					children: "Add assistant"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "w-10" })
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid min-h-[420px] md:grid-cols-[1fr_1.05fr]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-b border-border p-3 md:border-b-0 md:border-r",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mb-2 px-2 text-[11px] font-medium text-fg-subtle",
						children: "Specialized assistants"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "space-y-0.5",
						children: assistants.map((a) => {
							const selected = a.id === activeId;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => setActiveId(a.id),
								className: cn("flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition", selected ? "bg-bg-subtle" : "hover:bg-bg-subtle/70"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", a.accent),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(a.Icon, {
										className: "size-4",
										strokeWidth: 1.75
									})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block text-[13.5px] font-semibold tracking-tight",
										children: a.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mt-0.5 block text-[12.5px] text-fg-muted",
										children: a.desc
									})]
								})]
							}, a.id);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-[13.5px] font-medium text-fg-muted hover:bg-bg-subtle/70",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "grid size-9 place-items-center rounded-xl border border-dashed border-border-strong/50",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
								className: "size-4",
								strokeWidth: 1.75
							})
						}), "Create an assistant"]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col p-5 sm:p-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: cn("grid size-11 shrink-0 place-items-center rounded-2xl", active.accent),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(active.Icon, {
								className: "size-5",
								strokeWidth: 1.75
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[17px] font-semibold tracking-tight",
							children: active.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[13.5px] leading-relaxed text-fg-muted text-pretty",
							children: active.blurb
						})] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-[11px] font-medium text-fg-subtle",
							children: "Tools"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap gap-1.5",
							children: active.tools.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-lg border border-border bg-bg px-2.5 py-1 text-[12px] font-medium",
								children: t
							}, t))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-2 text-[11px] font-medium text-fg-subtle",
							children: "Model"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-[13px] font-medium",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-full bg-success" }), active.model]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-auto border-t border-border pt-5",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-fg shadow-btn transition hover:bg-primary-hover",
							children: "Use this assistant"
						})
					})
				]
			})]
		})]
	});
}
var steps = [
	{
		n: "1",
		title: "Describe the outcome",
		body: "Tell Sharker what needs to happen in plain language. It plans the steps and gets to work."
	},
	{
		n: "2",
		title: "Connect your tools",
		body: "Bring in the apps you already use so Sharker can gather context and act across them."
	},
	{
		n: "3",
		title: "Review the result",
		body: "Sharker handles the work end to end, then brings you the finished result to review."
	}
];
function HowItWorks() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mx-auto grid max-w-5xl gap-10 md:grid-cols-3 md:gap-6",
		children: steps.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "text-center md:text-left",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mx-auto mb-4 grid size-10 place-items-center rounded-full border border-border bg-bg-elevated text-sm font-semibold text-fg shadow-soft md:mx-0",
					children: s.n
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "text-[17px] font-semibold tracking-tight text-fg",
					children: s.title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[14px] leading-relaxed text-fg-muted text-pretty",
					children: s.body
				})
			]
		}, s.n))
	});
}
/**
* Premium shoreline wrap for bottom-of-page content.
* Photographic seascape only — no cartoon waves.
*/
function OceanShore({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "ocean-shore",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ocean-shore__photo",
				"aria-hidden": true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ocean-shore__veil",
				"aria-hidden": true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ocean-shore__content",
				children
			})
		]
	});
}
var links = [
	{
		href: "#product",
		label: "Product"
	},
	{
		href: "#pricing",
		label: "Pricing"
	},
	{
		href: "#faq",
		label: "Blog"
	}
];
function SiteNav() {
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "relative z-20 px-3 pt-[calc(0.75rem+var(--grok-banner-h,0px))] sm:px-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex max-w-[720px] items-center justify-between gap-2 rounded-full border border-white/70 bg-white/75 px-2 py-1.5 shadow-nav backdrop-blur-xl sm:px-2.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: "#top",
					className: "flex items-center gap-2 rounded-full py-1 pl-2 pr-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: "/logo-shark.png",
						alt: "",
						className: "h-[22px] w-auto"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[15px] font-semibold tracking-tight text-fg",
						children: "Sharker"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "hidden items-center gap-0.5 md:flex",
					children: links.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: l.href,
						className: "rounded-full px-3.5 py-2 text-[13.5px] font-medium text-fg-muted transition-colors hover:text-fg",
						children: l.label
					}, l.label))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "https://github.com/syy-shark/sharker",
						target: "_blank",
						rel: "noreferrer",
						className: "hidden h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg shadow-btn transition hover:bg-primary-hover sm:inline-flex",
						children: "Download"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "grid size-9 place-items-center rounded-full text-fg-muted md:hidden",
						"aria-label": open ? "Close menu" : "Open menu",
						onClick: () => setOpen((v) => !v),
						children: open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Menu, { className: "size-4" })
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: cn("mx-auto mt-2 max-w-[720px] overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-soft backdrop-blur-xl transition-all duration-200 md:hidden", open ? "max-h-64 opacity-100" : "max-h-0 border-0 opacity-0"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col p-2",
				children: [links.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: l.href,
					onClick: () => setOpen(false),
					className: "rounded-xl px-3 py-3 text-sm font-medium text-fg hover:bg-bg-subtle",
					children: l.label
				}, l.label)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: "https://github.com/syy-shark/sharker",
					target: "_blank",
					rel: "noreferrer",
					className: "mt-1 rounded-full bg-primary py-2.5 text-center text-sm font-medium text-primary-fg",
					children: "Download"
				})]
			})
		})]
	});
}
var threads = [
	"New chat",
	"Weekly status update",
	"Find that document",
	"Summarize this PDF",
	"Draft client follow-up",
	"What did we decide?",
	"Meeting prep",
	"Trip planning",
	"Quick question",
	"Fix my resume bullets",
	"Budget spreadsheet help",
	"Newsletter cleanup",
	"Email to landlord",
	"Same doc, next section",
	"Follow up on refund"
];
var modelGroups = [
	{
		label: "OpenAI",
		Logo: LogoOpenAI,
		items: [
			{
				name: "Sol",
				id: "openai/gpt-5.6-sol"
			},
			{
				name: "Terra",
				id: "openai/gpt-5.6-terra"
			},
			{
				name: "Luna",
				id: "openai/gpt-5.6-luna"
			},
			{
				name: "GPT 5.5",
				id: "openai/gpt-5.5"
			}
		]
	},
	{
		label: "Anthropic",
		Logo: LogoAnthropic,
		items: [
			{
				name: "Fable 5",
				id: "anthropic/claude-fable-5"
			},
			{
				name: "Opus 5",
				id: "anthropic/claude-opus-5"
			},
			{
				name: "Opus 4.8",
				id: "anthropic/claude-opus-4-8"
			}
		]
	},
	{
		label: "Google",
		Logo: LogoGemini,
		items: [
			{
				name: "Gemini 3.1 Pro",
				id: "google/gemini-3.1-pro"
			},
			{
				name: "Gemini 3.6 Flash",
				id: "google/gemini-3.6-flash"
			},
			{
				name: "Gemini 3.5 Flash",
				id: "google/gemini-3.5-flash"
			}
		]
	},
	{
		label: "Others",
		Logo: LogoXAI,
		items: [
			{
				name: "Grok 4.5",
				id: "xai/grok-4.5",
				Logo: LogoXAI
			},
			{
				name: "DeepSeek V4 Flash",
				id: "deepseek/deepseek-v4-flash",
				Logo: LogoDeepSeek
			},
			{
				name: "Kimi K3",
				id: "moonshotai/kimi-k3",
				Logo: LogoKimi
			}
		]
	}
];
var tools = [
	{
		name: "Gmail",
		desc: "Search, read, and draft email",
		connected: true,
		logo: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoGmail, { className: "size-5" })
	},
	{
		name: "Slack",
		desc: "Search conversations and messages",
		connected: true,
		logo: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoSlack, { className: "size-5" })
	},
	{
		name: "Google Calendar",
		desc: "Find events and availability",
		connected: true,
		logo: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoCalendar, { className: "size-5" })
	},
	{
		name: "Google Drive",
		desc: "Search and organize files",
		connected: false,
		logo: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoDrive, { className: "size-5" })
	},
	{
		name: "Notion",
		desc: "Search pages and databases",
		connected: false,
		logo: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoNotion, { className: "size-5" })
	},
	{
		name: "Asana",
		desc: "Create and track tasks",
		connected: false,
		logo: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoAsana, { className: "size-5" })
	}
];
function DownloadCta({ label = "Download Sharker" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
		href: "https://github.com/syy-shark/sharker",
		target: "_blank",
		rel: "noreferrer",
		className: "inline-flex h-12 items-center overflow-hidden rounded-full bg-primary text-primary-fg shadow-btn transition hover:bg-primary-hover active:scale-[0.985]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "pl-6 pr-3 text-[15px] font-medium",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mr-1.5 grid size-9 place-items-center rounded-full bg-white/20",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
				className: "size-4",
				strokeWidth: 2.25
			})
		})]
	});
}
function Home() {
	const marqueeItems = [...threads, ...threads];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		id: "top",
		className: "page-canvas",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SiteNav, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-12",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-[680px] text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
							className: "hero-title text-[2.75rem] text-fg sm:text-[3.4rem] md:text-[3.85rem]",
							children: [
								"Work at the speed",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-primary",
									children: "of thought."
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mx-auto mt-5 max-w-md text-[15px] leading-[1.55] text-fg-muted sm:text-[16px]",
							children: "For work that happens in a browser, an inbox, or a file, hand it off in one sentence."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DownloadCta, { label: "Download Sharker" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "#demo",
								className: "text-[15px] font-medium text-fg-muted transition hover:text-fg",
								children: "Book a team demo"
							})]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					id: "demo",
					className: "mt-14 sm:mt-16",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppMock, {})
				})]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "overflow-hidden pb-8 pt-16 sm:pb-10 sm:pt-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-4 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "section-title text-center text-[1.9rem] text-fg sm:text-[2.4rem]",
						children: "In other apps, you get threads"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "marquee-mask mt-10 overflow-hidden",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "marquee-track",
							children: marqueeItems.map((t, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "shrink-0 rounded-xl border border-white/60 bg-white/55 px-4 py-3 text-[13px] text-fg-subtle shadow-soft backdrop-blur-sm",
								children: t
							}, `${t}-${i}`))
						})
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				id: "product",
				className: "band band-soft py-16 sm:py-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-4 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "section-title mx-auto max-w-xl text-center text-[1.9rem] text-fg sm:text-[2.4rem]",
						children: [
							"With Sharker, you get",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
							"assistants that do the work"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-12",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeatureGrid, {})
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "py-16 sm:py-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-4 sm:px-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HowItWorks, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-20 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] font-semibold uppercase tracking-[0.08em] text-primary",
									children: "Describe the outcome"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
									className: "section-title mt-3 text-[1.6rem] text-fg sm:text-[1.9rem]",
									children: "Tell Sharker what needs to happen in plain language."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-[15px] leading-relaxed text-fg-muted",
									children: "It plans the steps and gets to work."
								})
							] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mock-shell p-5 sm:p-6",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "grid size-7 place-items-center rounded-lg bg-[#e8f0fe] text-[#1a56db]",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRocket, { className: "size-4" })
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[12px] font-medium text-fg-subtle",
											children: "New task"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[15px] font-semibold text-fg",
											children: "What should we get done?"
										})] })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-4 rounded-2xl border border-border bg-bg-subtle/60 p-4 text-[13.5px] leading-relaxed text-fg",
										children: "Draft the launch announcement email for Thursday. Pull the highlights from the beta feedback doc in Drive, match the tone of our last launch email, and include the updated pricing."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoAnthropic, { className: "size-3.5" }), "anthropic/claude-fable-5"]
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-20 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "order-2 lg:order-1",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mock-shell",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "border-b border-border px-4 py-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[13px] font-semibold",
											children: "Tools"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-0.5 text-[12px] text-fg-muted",
											children: "Connect apps and manage connected accounts available to Sharker."
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "divide-y divide-border",
										children: tools.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center gap-3 px-4 py-3",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "grid size-9 place-items-center rounded-lg bg-bg-subtle",
													children: t.logo
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "min-w-0 flex-1",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "text-[13.5px] font-medium",
														children: t.name
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "text-[12px] text-fg-muted",
														children: t.desc
													})]
												}),
												t.connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "text-[12px] font-medium text-success",
													children: "Connected"
												}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "text-[12px] text-fg-subtle",
													children: "—"
												})
											]
										}, t.name))
									})]
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "order-1 lg:order-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[13px] font-semibold uppercase tracking-[0.08em] text-primary",
										children: "Connect your tools"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "section-title mt-3 text-[1.6rem] text-fg sm:text-[1.9rem]",
										children: "Bring in the apps you already use."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-3 text-[15px] leading-relaxed text-fg-muted",
										children: "So Sharker can gather context and act across them."
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-20 grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[13px] font-semibold uppercase tracking-[0.08em] text-primary",
									children: "Review the result"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
									className: "section-title mt-3 text-[1.6rem] text-fg sm:text-[1.9rem]",
									children: "Finished work, ready for your eyes."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-[15px] leading-relaxed text-fg-muted",
									children: "Sharker handles the work end to end, then brings you the result to review."
								})
							] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mock-shell p-5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "grid size-7 place-items-center rounded-lg bg-[#e8f0fe] text-[#1a56db]",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphInbox, { className: "size-4" })
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-[13px] font-semibold",
											children: "Inbox manager"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[11px] text-fg-subtle",
										children: "Thu, Aug 6, 4:12 PM"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-4 ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary-soft px-3.5 py-2.5 text-[13px] leading-relaxed",
										children: "Follow up with everyone who replied to the launch email today."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 max-w-[95%] space-y-3 rounded-2xl rounded-tl-md border border-border bg-bg-subtle/50 p-3.5 text-[13px] leading-relaxed",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Done — I triaged 14 replies and sent 12 thank-you notes. One deal needs your voice, so I drafted it for review:" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "rounded-xl border border-border bg-bg-elevated p-3 text-[12.5px]",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "mb-2 flex items-center gap-1.5",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoGmail, { className: "size-3.5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "text-[11px] font-medium text-fg-subtle",
															children: "Draft"
														})]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "font-medium",
														children: "To: Sarah Lindqvist · Nordic Robotics"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-1 text-fg-muted",
														children: "Subject: Rolling Sharker out to your team"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "mt-2 text-fg-muted",
														children: "Hi Sarah, glad the launch resonated with your team. For a 40-seat rollout the next step is a short pilot…"
													})
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-fg",
													children: "Send email"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													className: "rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-[12px] font-medium",
													children: "Edit draft"
												})]
											})
										]
									})
								]
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				id: "features",
				className: "band band-mist py-16 sm:py-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-4 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mx-auto max-w-2xl text-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "section-title text-[1.9rem] text-fg sm:text-[2.4rem]",
							children: [
								"Sharker can do everything",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								"that you can do in the browser."
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-[15px] leading-relaxed text-fg-muted",
							children: "Sharker drives a real browser, signed in with your profiles. If you can do it on a website, you can hand it off."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mock-shell mx-auto mt-12 max-w-3xl",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 border-b border-border bg-mock-chrome px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-1.5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-[#ff5f57]" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-[#febc2e]" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-[#28c840]" })
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-1 items-center justify-center gap-2 rounded-md bg-bg-elevated px-3 py-1 text-[12px] text-fg-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoGmail, { className: "size-3.5" }), "mail.google.com"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid md:grid-cols-[180px_1fr]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
								className: "hidden border-r border-border p-3 text-[12.5px] text-fg-muted md:block",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mb-3 flex items-center gap-2 font-semibold text-fg",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogoGmail, { className: "size-4" }), "Gmail"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "rounded-lg bg-primary-soft px-2 py-1.5 font-medium text-fg",
										children: "Inbox 4"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 px-2 py-1.5",
										children: "Starred"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "px-2 py-1.5",
										children: "Snoozed"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "px-2 py-1.5",
										children: "Sent"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "px-2 py-1.5",
										children: "Drafts 2"
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "p-4 sm:p-5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[13px] font-semibold",
										children: "Purchase request — recycled mailer boxes"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-4 flex gap-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "grid size-9 shrink-0 place-items-center rounded-full bg-[#fce7f3] text-[12px] font-bold text-[#9d174d]",
											children: "M"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0 text-[13.5px] leading-relaxed",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-semibold",
														children: "Maya Chen"
													}),
													" ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "text-fg-subtle",
														children: "<maya@sharker.dev>"
													})
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
													className: "text-[12px] text-fg-subtle",
													children: "10:42 AM (12 minutes ago)"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
													className: "mt-3 text-fg",
													children: "Hey — could you order 1,000 recycled kraft mailer boxes for the Atlas launch kits? We need the 12 × 9 × 4 inch size, natural kraft, with no custom printing."
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
													className: "mt-2 text-fg",
													children: "We've used Apex Packaging before. Please ship them to the San Francisco office and send me the confirmation link when it's done."
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
													className: "mt-2 text-fg",
													children: "Thanks! Maya"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-6 text-[12px] font-medium text-primary",
										children: "Sharker · Reading what Maya needs"
									})
								]
							})]
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "py-16 sm:py-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-4 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mx-auto max-w-xl text-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "section-title text-[1.9rem] text-fg sm:text-[2.4rem]",
							children: [
								"The best model for",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								"every kind of work."
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-[15px] text-fg-muted",
							children: "Switch models without switching apps. Your assistants, tools, and context stay exactly where they are."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mock-shell mx-auto mt-12 max-w-md p-4",
						children: modelGroups.map((group, gi) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: gi > 0 ? "mt-4" : void 0,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center gap-2 text-[11px] font-medium text-fg-subtle",
								children: [group.label !== "Others" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(group.Logo, { className: "size-3.5" }) : null, group.label]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-1",
								children: group.items.map((m) => {
									const RowLogo = m.Logo ?? group.Logo;
									const active = group.label === "OpenAI" && m.name === "Terra";
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: active ? "flex items-center justify-between gap-2 rounded-xl bg-bg-subtle px-3 py-2.5" : "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "flex min-w-0 items-center gap-2 text-[13.5px] font-medium",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RowLogo, { className: "size-3.5 shrink-0" }), m.name]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "truncate text-[11px] text-fg-subtle",
											children: m.id
										})]
									}, m.id);
								})
							})]
						}, group.label))
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				id: "faq",
				className: "band band-soft py-16 sm:py-24",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-4 sm:px-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "section-title mb-10 text-center text-[1.9rem] text-fg sm:text-[2.4rem]",
						children: "Frequently asked questions"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FaqSection, {})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(OceanShore, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "pb-6 pt-20 sm:pb-8 sm:pt-28",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mx-auto max-w-2xl px-4 text-center sm:px-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "hero-title text-[2.2rem] text-fg sm:text-[3rem]",
							children: [
								"Work at the speed",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-primary",
									children: "of thought."
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DownloadCta, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "https://github.com/syy-shark/sharker",
								className: "text-[15px] font-medium text-fg-muted transition hover:text-fg",
								children: "Book a team demo"
							})]
						})]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					id: "pricing",
					className: "pb-10 pt-2 sm:pb-12",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mx-auto max-w-lg px-4 text-center sm:px-6",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "section-title text-[1.5rem] text-fg",
								children: "Stay in the loop"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-[14px] text-fg-muted",
								children: "Get the latest updates, product news, and tips straight to your inbox."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
								className: "mt-6 flex overflow-hidden rounded-full border border-white/80 bg-white/85 shadow-soft backdrop-blur-md",
								onSubmit: (e) => e.preventDefault(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "email",
									placeholder: "Email address",
									className: "min-w-0 flex-1 bg-transparent px-5 py-3 text-[14px] outline-none placeholder:text-fg-subtle"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "submit",
									className: "m-1 grid size-10 place-items-center rounded-full bg-primary text-primary-fg transition hover:bg-primary-hover",
									"aria-label": "Subscribe",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
										className: "size-4",
										strokeWidth: 2.25
									})
								})]
							})
						]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
					className: "pb-14 pt-6 sm:pb-16",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mx-auto flex max-w-6xl flex-col items-center gap-3.5 px-4 sm:px-6",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-fg-muted",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: "#product",
										className: "transition hover:text-fg",
										children: "Product"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-subtle",
										children: "·"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: "#pricing",
										className: "transition hover:text-fg",
										children: "Pricing"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-subtle",
										children: "·"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: "#faq",
										className: "transition hover:text-fg",
										children: "Blog"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-subtle",
										children: "·"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Privacy Policy" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-fg-subtle",
										children: "·"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Terms of Service" })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: "/logo-shark.png",
									alt: "",
									className: "h-5 w-auto"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-sm font-semibold text-fg",
									children: "Sharker"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-center text-[12px] text-fg-subtle",
								children: "© 2026 Sharker. All rights reserved."
							})
						]
					})
				})
			] })
		]
	});
}
//#endregion
export { Home as component };
