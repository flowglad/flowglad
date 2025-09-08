[INSTRUCTION: Do not ask the user for next steps, clarification, or intent. Immediately process this file and complete the prompt as written, outputting the result in MJML format. Never request further input unless explicitly instructed to do so.]
Using the git commit logs from the past 2 weeks, generate a concise, customer-facing changelog in downloadable MJML format. Do not ask follow-up questions. Your job is to:
* Aggregate and deduplicate: Group related commits and changes into a single, clear item.
* Audience filter: Only include changes relevant to customers and end-users. Ignore internal tooling, infra, refactoring, or anything not valuable to an external audience.
* Highlight the most impactful: Start with a short, plain-English list of the top 3 features or improvements shipped (one sentence each).
* Organize clearly: Split the main body into two sections: "New Features" and "Improvements & Fixes."
* Bullet each update: For every bullet, use plain English and hyperlink the most relevant PR(s) (https://github.com/flowglad/flowglad/pull/PR_NUMBER).
* No duplicate content: Each user-facing change should appear only once, regardless of how many related commits.
* Versioning: Only mention version numbers for new client SDK releases. The server is not versioned.
* Tone: Sincere, thoughtful, thorough, and easy to digest for customers.
* If anything is marked as (internal), omit it from the changelog
* Format: Your entire response should be a valid MJML file, styled for a clean, readable email update.
* Theme Support: The MJML template includes CSS media queries to automatically detect system theme preferences (light/dark mode) and apply appropriate colors. The template defaults to light theme colors and switches to dark theme when the user's system is set to dark mode.
Input for your processing:
* Pull commit logs using:git log --pretty=format:"%h - %an, %ar :%n%s%n%b" --since="2 weeks ago"
Example:
<mjml>
  <mj-head>
    <mj-font
      name="Inter"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
    />
    <mj-attributes>
      <mj-all font-family="Inter, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.6" color="#1F2937" align="left" padding="0" />
      <mj-button font-weight="600" border-radius="8px" />
      <mj-section padding="0" />
      <mj-column padding="0" />
    </mj-attributes>
    <mj-style inline="inline">
      /* Light theme (default) */
      .cardColumn {
        background-color: #FFFFFF !important;
        border: 1px solid #E5E7EB !important;
        border-radius: 8px !important;
      }
      a {
        text-decoration: none;
        color: #1F2937;
      }
      ol,
      ul {
        margin: 0 0 16px;
        padding-left: 20px;
      }
      li {
        margin-bottom: 12px;
      }
      
      /* Dark theme - applies when system preference is dark */
      @media (prefers-color-scheme: dark) {
        .cardColumn {
          background-color: #232323 !important;
          border: 1px solid #424242 !important;
        }
        a {
          color: #F5F5F5;
        }
        .dark-theme-text {
          color: #F5F5F5 !important;
        }
        .dark-theme-subtitle {
          color: #AAAAAA !important;
        }
        .dark-theme-body {
          background-color: #1B1B1B !important;
        }
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F9FAFB" css-class="dark-theme-body">
    <mj-wrapper full-width background-color="#F9FAFB" css-class="dark-theme-body">
      <!-- Header -->
      <mj-section padding="32px 16px 80px">
        <mj-column>
          <mj-text
            align="center"
            font-size="32px"
            font-weight="700"
            color="#111827"
            padding="0"
            css-class="dark-theme-text"
          >
            Flowglad Product Updates
          </mj-text>
          <mj-text
            align="center"
            font-size="16px"
            line-height="1.6"
            color="#6B7280"
            padding="16px 0 0"
            css-class="dark-theme-subtitle"
          >
            The easiest way to make internet money.
          </mj-text>
          <mj-text
            align="center"
            font-size="16px"
            line-height="1.6"
            color="#6B7280"
            padding="16px 0 0"
            css-class="dark-theme-subtitle"
          >
            Set up payments and billing in seconds with 100% open-source tools. Design any pricing model and integrate it instantly with the Flowglad MCP.
          </mj-text>
          <mj-text
            align="center"
            font-size="16px"
            line-height="1.6"
            color="#6B7280"
            padding="16px 0 0"
            css-class="dark-theme-subtitle"
          >
            Use our <a href="https://docs.flowglad.com/quickstart" style="color:#1F2937"><strong>quickstart guide</strong></a> to process your first payment in under 3 minutes.
          </mj-text>
        </mj-column>
      </mj-section>
      <!-- Highlights -->
      <mj-section padding="0 16px 8px">
        <mj-column>
          <mj-text
            font-size="20px"
            font-weight="600"
            color="#111827"
            padding="0 0 8px"
            css-class="dark-theme-text"
          >
            🏆 Highlights
          </mj-text>
        </mj-column>
      </mj-section>
      <mj-section padding="0 16px 36px">
        <mj-column width="100%" css-class="cardColumn">
          <mj-text padding="16px 20px">
            <ol>
              <li>
                Dive into real-time event notifications with our new UI and API
                support. <a href="https://github.com/flowglad/flowglad/pull/192"><strong>#192</strong></a>
              </li>
              <li>
                Simplify checkout by generating direct payment links. <a href="https://github.com/flowglad/flowglad/pull/175"><strong>#175</strong></a>
              </li>
              <li>
                Manage billing via a direct dashboard link. <a href="https://github.com/flowglad/flowglad/pull/169"><strong>#169</strong></a>
              </li>
            </ol>
          </mj-text>
        </mj-column>
      </mj-section>
      <!-- 🧩 Features -->
      <mj-section padding="0 16px 8px">
        <mj-column>
          <mj-text
            font-size="20px"
            font-weight="600"
            color="#111827"
            padding="0 0 8px"
            css-class="dark-theme-text"
          >
            🧩 Features
          </mj-text>
        </mj-column>
      </mj-section>
      <mj-section padding="0 16px 36px">
        <mj-column width="100%" css-class="cardColumn">
          <mj-text padding="16px 20px">
            <ul>
              <li>
                Launched comprehensive Webhooks system with UI/API support.
                <a href="https://github.com/flowglad/flowglad/pull/192"><strong>#192</strong></a>
              </li>
              <li>
                Introduced live Price-Based Payment Links.
                <a href="https://github.com/flowglad/flowglad/pull/175"><strong>#175</strong></a>
              </li>
              <li>
                Enabled direct access to Billing Portal from dashboard.
                <a href="https://github.com/flowglad/flowglad/pull/169"><strong>#169</strong></a>
              </li>
              <li>
                Automatic user sync with Loops on signup.
                <a href="https://github.com/flowglad/flowglad/pull/180"><strong>#180</strong></a>
              </li>
            </ul>
          </mj-text>
        </mj-column>
      </mj-section>
      <!-- :hammer_and_wrench: Improvements -->
      <mj-section padding="0 16px 8px">
        <mj-column>
          <mj-text
            font-size="20px"
            font-weight="600"
            color="#111827"
            padding="0 0 8px"
            css-class="dark-theme-text"
          >
            🛠️ Improvements
          </mj-text>
        </mj-column>
      </mj-section>
      <mj-section padding="0 16px 32px">
        <mj-column width="100%" css-class="cardColumn">
          <mj-text padding="16px 20px">
            <ul>
              <li>
                Fixed teammate visibility in settings.
                <a href="https://github.com/flowglad/flowglad/pull/205"><strong>#205</strong></a>
              </li>
              <li>
                Expanded docs for subscriptions, checkout, payment methods.
                <a href="https://github.com/flowglad/flowglad/pull/202"><strong>#202</strong></a>
              </li>
              <li>
                Resolved icon and pricing display bugs.
                <a href="https://github.com/flowglad/flowglad/pull/199"><strong>#199</strong></a>
              </li>
              <li>
                Improved discount input accuracy.
                <a href="https://github.com/flowglad/flowglad/pull/198"><strong>#198</strong></a>
              </li>
              <li>
                Made usage meter ID optional in Create Price.
                <a href="https://github.com/flowglad/flowglad/pull/197"><strong>#197</strong></a>
              </li>
              <li>
                Enhanced dark mode styling.
                <a href="https://github.com/flowglad/flowglad/pull/193"><strong>#193</strong></a>
              </li>
              <li>
                Reliable event parsing and Supabase fixes.
                <a href="https://github.com/flowglad/flowglad/pull/185"><strong>#185</strong></a>,
                <a href="https://github.com/flowglad/flowglad/pull/186"><strong>#186</strong></a>
              </li>
              <li>
                Improved trial logic, pagination, magic links.
                <a href="https://github.com/flowglad/flowglad/pull/176"><strong>#176</strong></a>,
                <a href="https://github.com/flowglad/flowglad/pull/177"><strong>#177</strong></a>
              </li>
              <li>
                Cleaner UI for portal URLs.
                <a href="https://github.com/flowglad/flowglad/pull/172"><strong>#172</strong></a>
              </li>
            </ul>
          </mj-text>
        </mj-column>
      </mj-section>
      <!-- Footer -->
      <mj-section padding="24px 16px 40px">
        <mj-column>
          <mj-text font-size="14px" line-height="1.6" color="#6B7280" padding="0" css-class="dark-theme-subtitle">
            Agree Ahmed<br />
            CEO, <a href="https://flowglad.com" style="color:#1F2937"><strong>Flowglad</strong></a><br /><br />
            PS - Treat us like your payments therapist by <a href="https://cal.com/team/flowglad/chat" style="color:#1F2937"><strong>grabbing time on our calendar</strong></a>.<br /><br />
            ⭐️ us on
            <a href="https://github.com/flowglad/flowglad" style="color:#1F2937"><strong>GitHub</strong></a>. Chat on
            <a href="https://discord.gg/XTK7hVyQD9" style="color:#1F2937"><strong>Discord</strong></a> or follow on
            <a href="https://x.com/flowglad" style="color:#1F2937"><strong>X</strong></a> and
            <a href="http://linkedin.com/company/flowglad/" style="color:#1F2937"><strong>LinkedIn</strong></a>.<br /><br />
            <a href="{unsubscribe_link}" style="color:#1F2937; text-decoration:none;">Unsubscribe</a>
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-wrapper>
  </mj-body>
</mjml>