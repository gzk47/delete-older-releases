const fetch = require("./fetch");

if (!process.env.GITHUB_TOKEN) {
  console.error("🔴 no GITHUB_TOKEN found. pass `GITHUB_TOKEN` as env");
  process.exitCode = 1;
  return;
}
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!process.env.GITHUB_REPOSITORY) {
  console.error(
    "🔴 no GITHUB_REPOSITORY found. pass `GITHUB_REPOSITORY` as env"
  );
  process.exitCode = 1;
  return;
}

if (!process.env.INPUT_REPO) {
  console.warn("💬  no `repo` name given. fall-ing back to this repo");
}

const [owner, repo] = (
  process.env.INPUT_REPO || process.env.GITHUB_REPOSITORY
).split("/");

if (!owner || !repo) {
  console.error("☠️  either owner or repo name is empty. exiting...");
  process.exitCode = 1;
  return;
}

if (!process.env.INPUT_KEEP_LATEST) {
  console.error("✋🏼  no `keep_latest` given. exiting...");
  process.exitCode = 1;
  return;
}

const keepLatest = Number(process.env.INPUT_KEEP_LATEST);

if (Number.isNaN(keepLatest) || keepLatest < 0) {
  console.error("🤮  invalid `keep_latest` given. exiting...");
  process.exitCode = 1;
  return;
}

if (keepLatest === 0) {
  console.error("🌶  given `keep_latest` is 0, this will wipe out all releases");
}

const shouldDeleteTags = process.env.INPUT_DELETE_TAGS === "true";

if (shouldDeleteTags) {
  console.log("🔖  corresponding tags also will be deleted");
}

const deletePrereleaseOnly = process.env.INPUT_DELETE_PRERELEASE_ONLY === "true";

if (deletePrereleaseOnly) {
  console.log("🔖  Remove only prerelease");
}

let deletePatternStr = process.env.INPUT_DELETE_TAG_PATTERN || "";
let deletePattern = new RegExp("");
if (deletePatternStr) {
  console.log(`releases matching ${deletePatternStr} will be targeted`);
  deletePattern = new RegExp(deletePatternStr);
}

let keepMinDownloadCount = Number(process.env.INPUT_KEEP_MIN_DOWNLOAD_COUNTS);

if (Number.isNaN(keepMinDownloadCount) || keepMinDownloadCount < 0) {
  keepMinDownloadCount = 0
}

if (keepMinDownloadCount === 0) {
  console.error("🌶  given `keep_min_download_counts` is 0, this will not enable the download count removal rule");
}else {
  console.log("🌶  given `keep_min_download_counts` is ",keepMinDownloadCount,", this will continue to add the download count deletion rule to the original deletion rule");
}


let deleteExpiredData = Number(process.env.INPUT_DELETE_EXPIRED_DATA);

if (Number.isNaN(deleteExpiredData) || deleteExpiredData < 0) {
  deleteExpiredData = 0
}

console.log("🌶  given `delete_expired_data` is ",deleteExpiredData);

let whiteListRaw = process.env.INPUT_TAG_WHITELIST || "";
const whiteSuffixArr = whiteListRaw.trim() ? whiteListRaw.split(",") : [];
if(whiteSuffixArr.length > 0){
  console.log("🔖 Tag whitelist suffix: ", whiteSuffixArr.join(","));
}

let gitHubRestApi = process.env.INPUT_GITHUB_REST_API_URL || "api.github.com";

const commonOpts = {
  host: gitHubRestApi,
  port: 443,
  protocol: "https:",
  auth: `user:${GITHUB_TOKEN}`,
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "node.js",
  },
};

function isInWhiteList(tagName){
  for(let suf of whiteSuffixArr){
    if(tagName.endsWith(suf)){
      return true;
    }
  }
  return false;
}

async function deleteOlderReleases(keepLatest, keepMinDownloadCount, deleteExpiredData) {
  let releaseIdsAndTags = [];
  try {
    const releasesData = [];
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      let pageData = await fetch({
        ...commonOpts,
        path: `/repos/${owner}/${repo}/releases?per_page=100&page=${page}`,
        method: "GET",
      });
      if (pageData.length === 0) {
        hasMorePages = false;
      } else {
        releasesData.push(...pageData);
        page++;
      }
    }

    data = releasesData || [];

    const activeMatchedReleases = data.filter((item) => {
      if (deletePrereleaseOnly) {
        if (deletePatternStr) {
          return !item.draft && item.prerelease && item.tag_name.match(deletePattern);
        } else {
          return !item.draft && item.prerelease;
        }
      } else {
        if (deletePatternStr) {
          return !item.draft && item.tag_name.match(deletePattern);
        } else {
          return !item.draft;
        }
      }
    })

    // const activeMatchedReleases = data.filter((item) => {
    //   const shouldDelete = deletePrereleaseOnly && deletePatternStr;
    //   const isDraft = item.draft;
    //   const hasAssets = item.assets.length > 0;
    //   const isPrerelease = item.prerelease;
    //   const isTagMatching = deletePatternStr ? item.tag_name.match(deletePattern) : true;
    
    //   return !isDraft && hasAssets && (shouldDelete ? (isTagMatching && isPrerelease) : true);
    // });

    if (activeMatchedReleases.length === 0) {
      console.log(`😕  no active releases found. exiting...`);
      return;
    }

    const matchingLoggingAddition = deletePattern.length > 0 ? " matching" : "";

    if (deletePrereleaseOnly) {
      console.log(
        `💬  found total of ${activeMatchedReleases.length}${matchingLoggingAddition} active prerelease(s)`
      );
    } else {
      console.log(
        `💬  found total of ${activeMatchedReleases.length}${matchingLoggingAddition} active release(s)`
      );
    }
    


    let sortedAll = activeMatchedReleases
      .sort((a,b)=> Date.parse(b.published_at) - Date.parse(a.published_at))
      .map(item=> {
        const totalDownloads = item.assets.reduce((sum, asset) => sum + asset.download_count, 0);
        return {
            id: item.id,
            tagName: item.tag_name,
            published_at: item.published_at,
            download_counts: totalDownloads
        }
      });

    const whiteListItems = [];
    const normalItems = [];
    for(let obj of sortedAll){
      if(isInWhiteList(obj.tagName)){
        whiteListItems.push(obj);
        console.log(`✅ Whitelist keep: ${obj.tagName}`);
      }else{
        normalItems.push(obj);
      }
    }

    releaseIdsAndTags = normalItems.slice(keepLatest);

    if (keepMinDownloadCount !== 0) 
    {
      if (deleteExpiredData !== 0) 
      {
        const currentDate = new Date();
        releaseIdsAndTags = releaseIdsAndTags.filter(item => {
          const publishedDate = new Date(item.published_at);
          const timeDifference = currentDate - publishedDate;
          const daysDifference = Math.floor(timeDifference / (1000 * 3600 * 24)); 
          return item.download_counts < keepMinDownloadCount || daysDifference > deleteExpiredData;
        });
      }
      else
      {
        releaseIdsAndTags=releaseIdsAndTags.filter(item => item.download_counts < keepMinDownloadCount);
      }
    }
    else
    {
      if (deleteExpiredData !== 0) 
      {
        const currentDate = new Date();
        releaseIdsAndTags = releaseIdsAndTags.filter(item => {
          const publishedDate = new Date(item.published_at);
          const timeDifference = currentDate - publishedDate;
          const daysDifference = Math.floor(timeDifference / (1000 * 3600 * 24));
          return daysDifference > deleteExpiredData;
        });
      }
    }


   }catch (error) {
    console.error(`🌶  failed to get list of releases <- ${error.message}`);
    console.error(`exiting...`);
    process.exitCode = 1;
    return;
  }

  if (releaseIdsAndTags.length === 0) {
    console.error(`😕  no older releases found. exiting...`);
    return;
  }
  console.log(`🍻  found ${releaseIdsAndTags.length} older release(s)`);

  let hasError = false;
  for (let i = 0; i < releaseIdsAndTags.length; i++) {
    const { id: releaseId, tagName } = releaseIdsAndTags[i];

    try {
      console.log(`starting to delete ${tagName} with id ${releaseId}`);

      const _ = await fetch({
        ...commonOpts,
        path: `/repos/${owner}/${repo}/releases/${releaseId}`,
        method: "DELETE",
      });

      if (shouldDeleteTags) {
        try {
          const _ = await fetch({
            ...commonOpts,
            path: `/repos/${owner}/${repo}/git/refs/tags/${encodeURI(tagName)}`,
            method: "DELETE",
          });
        } catch (error) {
          console.error(
            `🌶  failed to delete tag "${tagName}"  <- ${error.message}`
          );
          hasError = true;
          break;
        }
      }
    } catch (error) {
      console.error(
        `🌶  failed to delete release with id "${releaseId}"  <- ${error.message}`
      );
      hasError = true;
      break;
    }
  }

  if (hasError) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `👍🏼  ${releaseIdsAndTags.length} older release(s) deleted successfully!`
  );
}

async function run() {
  await deleteOlderReleases(keepLatest, keepMinDownloadCount, deleteExpiredData);
}

run();
