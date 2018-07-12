
var checked = []; //array that holds already checked users

//code entry point: streams all transactions on steemit
steem.api.streamTransactions('head', function(err, result) {
	
	if (err) {
		console.log(err);
	} else {
		var txType = result.operations[0][0];
		var txData = result.operations[0][1];
		
		if (txType=='comment' && txData.parent_author=='') {
			//checking if tx is a post
			//ensures we check profiles of people who post content
			try {
				//check author's posts and decide whether to print author to screen
				checkPosts(txData);
			} catch(err) {
				console.log(err);
			}
		}
	}
});

async function checkPosts(txData) {
	
	//exit if user has already been checked
	if (checked.indexOf(txData.author)>-1) return;
	
	//add user to checked list
	checked.push(txData.author);
	
	var vote_value = await getVoteValue(txData.author); //gets full vote value of author
	
	//get user defined conditions
	var minimum_vote_value = document.getElementById("upvote_value").value;
	var minimum_percent_upvoted = document.getElementById("percent_upvoted").value;
	
	//we dont want dust votes, so we exit
	if (vote_value<minimum_vote_value) return;
	
	//get users latest posts
	var posts = await steem.api.getDiscussionsByAuthorBeforeDateAsync(txData.author, null, new Date().toISOString().split('.')[0], 10)
	
	//introduce some variables
	var percent = 0; //percent of replies upvoted by author
	var avg_weight = 0; //average weight used by author to upvote
	var postsWithReplies = 0; //number of posts with replies, used for averaging purposes
	
	//loop through posts, ignoring most recent one as author may not have time to respond to recently made comments
	for (var i=1;i<posts.length;i++) {
		var upvote_info = await percentUpvoted(posts[i], txData); //get avg weight and percent of upvoted replies on current post being checked
		if (upvote_info!=0) { //doesnt include posts without replies
			var currPercent = upvote_info[0];
			var currWeight = upvote_info[1];
			percent += currPercent*100;
			avg_weight += currWeight;
			postsWithReplies++;
		}
	}
	
	//average values over all posts checked
	percent /= postsWithReplies;
	avg_weight /= postsWithReplies;
	
	//calculate vote value used to upvote repliers
	vote_value *= avg_weight; //aproximates average vote value used to upvote replies
	
	if (vote_value<minimum_vote_value) return; //check again for minimum vote value with the avg vote value used to upvote
	
	if (postsWithReplies>0 && percent>=minimum_percent_upvoted) { //ensures replies were made and frequency of upvotes meet input requirements
		console.log("steemit.com/@"+txData.author,"upvotes ~"+percent+"% of replies, with average vote value of ~$"+vote_value);
		document.getElementById("output").innerHTML += `<a href="https://steemit.com/@${txData.author}">@${txData.author}</a> upvotes ~${percent.toPrecision(0)} of replies, with average vote value of ~${vote_value.toPrecision(3)}.</br>`;
	}
}

async function percentUpvoted(post, txData) {
	
	var comments = await steem.api.getContentRepliesAsync(txData.author, post.permlink);
	if (comments.length<=0) return [];
	var avg_weight = 0;
	
	var percent = 0;
	for (var j=0;j<comments.length;j++) {
		if (comments[j].depth==1) {
			var weight = await authorUpvoted(comments[j], txData);
			if (weight>0) {
				percent++;
				avg_weight+=weight;
			}
		}
	}
	
	if (comments.length>0) {
		percent /= comments.length;
		avg_weight /= comments.length;
	}
	
	return [percent, avg_weight];
}

async function authorUpvoted(comment, txData) {
	var votes = await steem.api.getActiveVotesAsync(comment.author, comment.permlink);
	for (var k=0;k<votes.length;k++) {
		if (votes[k].voter == txData.author) {
			return votes[k].percent/10000;
		}
	}
	return 0;
}

async function getVoteValue(author) {
	//Calculations adapted from a post by @yabapmatt: https://steemit.com/steem/@yabapmatt/how-to-calculate-the-value-of-a-vote
	
	//getting blockchain info
	var info = await steem.api.getAccountsAsync([author]);
	var vesting_shares = ( parseFloat(info[0].received_vesting_shares) + parseFloat(info[0].vesting_shares) - parseFloat(info[0].delegated_vesting_shares) ) * 1000000;
	var reward_fund_info = await steem.api.getRewardFundAsync("post");
	var steem_price = await steem.api.getCurrentMedianHistoryPriceAsync();
	steem_price = parseFloat(steem_price.base);
	
	//actual calculation
	var vote_value = steem_price * ( (vesting_shares * 0.02) / parseFloat(reward_fund_info.recent_claims) ) * parseFloat(reward_fund_info.reward_balance);
	
	return vote_value;
}
